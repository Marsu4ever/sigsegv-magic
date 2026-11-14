/**
 * Home loan (mortgage) data for the current customer. Owner: DATA person. SERVER ONLY.
 *
 * Source: data/raw/mtg_*.csv → data/demo/<id>.json ("mortgage" field), made by
 * scripts/prepare-data.mjs. Only customers who applied for a mortgage have one.
 *
 * ⚠️ WHY we never judge the decision ourselves: we checked the data (14 Nov) and
 * the bank's decision can't be reproduced from transactions — approved and
 * rejected customers have about the same income vs. the "required income".
 * So we show the bank's decision and reason exactly as recorded, and the
 * customer's own income/spending next to it as plain facts.
 *
 * WHY not re-exported from ./index: this file imports from ./index, so a
 * re-export would be circular. Import from "@/lib/data/mortgage" directly.
 */
import type { MortgageEvent, MortgageSummary } from "@/lib/types";
import { addDays, endOfMonth, startOfMonth, toDate } from "./dates";
import { categoryKind, getDataToday, getTransactions, spentEur } from "./index";
import { loadCustomerData } from "./load";

/** Events that are summarised elsewhere (contact count, recorded-costs list), not in the timeline. */
const NOT_IN_TIMELINE = new Set(["customer_contact", "expense_recorded"]);

const round2 = (n: number) => Math.round(n * 100) / 100;

/** First day of the month `n - 1` months before the month of `date`. */
function monthsBackFrom(date: string, n: number): string {
  const [y, m] = date.split("-").map(Number);
  const index = y * 12 + (m - 1) - (n - 1);
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`;
}

/**
 * Average monthly income and spending over the last 12 FULL months in the data.
 * WHY 12 full months: salaries land on different days (15th, 29th…), so a short
 * or partial window can catch 5 or 7 paydays and give a misleading average.
 */
function monthlyMoney(): MortgageSummary["monthly"] {
  const today = getDataToday();
  const to = endOfMonth(today) === today ? today : addDays(startOfMonth(today), -1);
  const range = { from: monthsBackFrom(to, 12), to };
  let income = 0;
  let spending = 0;
  for (const t of getTransactions(range)) {
    if (categoryKind(t.category) === "income" && t.amountEur > 0) income += t.amountEur;
    spending += spentEur(t);
  }
  return { range, incomeEur: round2(income / 12), spendingEur: round2(spending / 12) };
}

function first(events: MortgageEvent[], type: string): MortgageEvent | undefined {
  return events.find((e) => e.type === type);
}

function last(events: MortgageEvent[], type: string): MortgageEvent | undefined {
  return events.findLast((e) => e.type === type);
}

/** Does the current customer have a mortgage application? */
export function hasMortgage(): boolean {
  return loadCustomerData().mortgage !== null;
}

/**
 * Everything the Home loan tab and the AI need, or null if the customer never
 * applied. All numbers are from the dataset or summed from it — nothing estimated.
 */
export function getMortgageSummary(): MortgageSummary | null {
  const m = loadCustomerData().mortgage;
  if (!m) return null;
  const events = m.events;

  const appliedOn = first(events, "application_created")?.date ?? events[0]?.date ?? "";
  const decision = last(events, "loan_decision");
  const decidedOn = decision?.date ?? events.at(-1)?.date ?? appliedOn;

  // Every home looked at, with its first and latest price estimate.
  const properties = new Map<string, MortgageSummary["propertiesConsidered"][number]>();
  for (const e of events) {
    if (!e.propertyId || e.propertyPriceEur === undefined) continue;
    const p = properties.get(e.propertyId);
    if (!p) {
      properties.set(e.propertyId, {
        id: e.propertyId,
        type: e.propertyType ?? "",
        firstPriceEur: e.propertyPriceEur,
        lastPriceEur: e.propertyPriceEur,
        chosen: false,
      });
    } else {
      p.lastPriceEur = e.propertyPriceEur;
      if (!p.type && e.propertyType) p.type = e.propertyType;
    }
  }
  // The home the decision was about (fallback: the last one a loan was calculated for).
  const chosenId = decision?.propertyId ?? last(events, "loan_calculation")?.propertyId;
  const chosen = chosenId ? properties.get(chosenId) : undefined;
  if (chosen) chosen.chosen = true;

  const recordedCosts = events
    .filter((e) => e.type === "expense_recorded" && e.expenseType)
    .map((e) => ({ label: e.expenseType as string, value: e.expenseEur ?? 0 }))
    .sort((a, b) => b.value - a.value);

  return {
    mortgageId: m.mortgageId,
    decision: m.decision,
    rejectionReason: m.rejectionReason,
    appliedOn,
    decidedOn,
    daysToDecision: appliedOn
      ? Math.round((toDate(decidedOn).getTime() - toDate(appliedOn).getTime()) / 86_400_000)
      : 0,
    property: {
      id: chosen?.id ?? "",
      type: decision?.propertyType ?? chosen?.type ?? "",
      priceEur: m.propertyPriceEur,
    },
    loanEur: m.loanEur,
    equityEur: m.equityEur,
    loanToValue: m.loanToValue,
    collateralValueEur: m.collateralValueEur,
    requiredMonthlyIncomeEur: m.requiredMonthlyIncomeEur,
    monthly: monthlyMoney(),
    propertiesConsidered: [...properties.values()],
    recordedCosts,
    collateral: events
      .filter((e) => e.type === "collateral_valuation")
      .map((e) => ({
        type: e.collateralType ?? "",
        valueEur: e.collateralValueEur ?? 0,
        status: e.collateralStatus ?? "",
      })),
    contactsWithBank: events.filter((e) => e.type === "customer_contact").length,
    timeline: events.filter((e) => !NOT_IN_TIMELINE.has(e.type)),
  };
}
