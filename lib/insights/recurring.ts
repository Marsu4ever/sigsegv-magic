/**
 * recurring_payments — fixed bills, subscriptions, automatic savings and
 * regular habits. Owner: INSIGHTS person. SERVER ONLY.
 *
 * HOW: looks at the last 12 months and groups payments by merchant (or by
 * category when there's no merchant, e.g. rent). A group that shows up in
 * 6+ different months is "recurring". Then:
 *   bill             — rent / utilities (no merchant, housing/utilities payment)
 *   subscription     — same merchant ~once a month, price varies ≤ 15 %
 *   automatic_saving — monthly transfers to investments/savings
 *   habit            — same merchant in 6+ months, but price varies (e.g. a favourite restaurant)
 *
 * WHY code and not the AI: finding patterns in 500–1,500 transactions is slow
 * and error-prone for an LLM. Code finds them; the AI explains them.
 * NOTE: the synthetic dataset seems to have few or no true subscriptions —
 * bills, savings and habits are what show up.
 */
import type { ChartRow, Transaction, UpcomingPayment } from "@/lib/types";
import {
  categoryKind,
  getDataToday,
  getTransactions,
  isSpending,
  merchantType,
  round2,
} from "@/lib/data";
import { addDays, endOfMonth, toDate } from "@/lib/data/dates";

/** "Restaurant MRC-RES-0068" / "Rent M-LANDLORD" → "Restaurant" / "Rent". */
export const withoutMerchantId = (name: string) => name.replace(/ [A-Z]+(-[A-Z0-9]+)+$/, "");

export type RecurringKind = "bill" | "subscription" | "automatic_saving" | "habit";

export type RecurringItem = {
  kind: RecurringKind;
  name: string; // "Housing", "Restaurant MRC-RES-0068"
  category: string;
  monthsSeen: number; // of the last 12
  timesSeen: number;
  averageAmountEur: number; // per payment
  perMonthEur: number; // average over the 12 months
  typicalDayOfMonth: number;
};

const MIN_MONTHS = 6;
const SUBSCRIPTION_MAX_VARIATION = 0.15;

function median(xs: number[]): number {
  const v = [...xs].sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : 0;
}

export function recurringPayments(): {
  window: { from: string; to: string };
  items: RecurringItem[];
  rows: ChartRow[];
} {
  const to = getDataToday();
  const from = addDays(to, -364);
  const groups = new Map<string, Transaction[]>();
  for (const t of getTransactions({ from, to })) {
    if (t.amountEur >= 0) continue;
    const saving = categoryKind(t.category) === "savings_move";
    if (!saving && !isSpending(t)) continue;
    const key = t.merchantId || `cat:${t.category}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  const items: RecurringItem[] = [];
  for (const [key, txs] of groups) {
    const months = new Set(txs.map((t) => t.date.slice(0, 7))).size;
    if (months < MIN_MONTHS) continue;
    const amounts = txs.map((t) => -t.amountEur);
    const total = amounts.reduce((s, a) => s + a, 0);
    const avg = total / amounts.length;
    const variation =
      Math.sqrt(amounts.reduce((s, a) => s + (a - avg) ** 2, 0) / amounts.length) / avg;
    const first = txs[0];
    const isMerchant = !key.startsWith("cat:");

    let kind: RecurringKind;
    if (categoryKind(first.category) === "savings_move") kind = "automatic_saving";
    else if (!isMerchant && /housing|utilities/i.test(first.transactionType)) kind = "bill";
    else if (isMerchant && variation <= SUBSCRIPTION_MAX_VARIATION && txs.length <= months * 1.2)
      kind = "subscription";
    else if (isMerchant) kind = "habit";
    else continue; // e.g. "all Entertainment without merchant" — not one recurring thing

    items.push({
      kind,
      name: isMerchant
        ? `${merchantType(first.mccCode) ?? first.category} ${first.merchantId}`
        : first.category,
      category: first.category,
      monthsSeen: months,
      timesSeen: txs.length,
      averageAmountEur: round2(avg),
      perMonthEur: round2(total / 12),
      typicalDayOfMonth: median(txs.map((t) => Number(t.date.slice(8, 10)))),
    });
  }

  const order: RecurringKind[] = ["bill", "subscription", "automatic_saving", "habit"];
  items.sort(
    (a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || b.perMonthEur - a.perMonthEur,
  );
  // Keep the list short: all bills/subscriptions/savings + the top 5 habits.
  const habits = items.filter((i) => i.kind === "habit").slice(0, 5);
  const kept = [...items.filter((i) => i.kind !== "habit"), ...habits];

  return {
    window: { from, to },
    items: kept,
    rows: kept.map((i) => ({
      label: `${i.name} (${i.kind.replace("_", " ")})`,
      value: i.perMonthEur,
    })),
  };
}

/**
 * Bills, subscriptions and automatic savings expected in the next `days` days (Home tab).
 * WHY "usual day of the month": the data has no due dates; each recurring payment's typical
 * day (median of the last 12 months) is the best guess, the same one safe_to_spend relies on.
 * Habits are left out: a favourite restaurant isn't a payment you must plan for.
 */
export function upcomingPayments(days = 31): UpcomingPayment[] {
  const today = getDataToday();
  const out: UpcomingPayment[] = [];
  for (const i of recurringPayments().items) {
    if (i.kind === "habit") continue;
    const date = nextDayOfMonth(today, i.typicalDayOfMonth);
    const inDays = Math.round((toDate(date).getTime() - toDate(today).getTime()) / 86_400_000);
    if (inDays > days) continue;
    out.push({
      name: withoutMerchantId(i.name),
      category: i.category,
      kind: i.kind,
      date,
      inDays,
      amountEur: i.averageAmountEur,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || b.amountEur - a.amountEur);
}

/** The next date after `today` that falls on `day` of the month (31 → the month's last day). */
function nextDayOfMonth(today: string, day: number): string {
  const inMonth = (monthStart: string) => {
    const last = Number(endOfMonth(monthStart).slice(8, 10));
    return `${monthStart.slice(0, 8)}${String(Math.min(day, last)).padStart(2, "0")}`;
  };
  const thisMonth = inMonth(`${today.slice(0, 7)}-01`);
  if (thisMonth > today) return thisMonth;
  return inMonth(addDays(endOfMonth(today), 1));
}
