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

/** One detected group: the summary item, its payments (oldest first) and how much the price varies. */
type Group = { item: RecurringItem; txs: Transaction[]; variation: number };

/** Groups the last 12 months of outgoing payments and keeps the ones that come back. */
function detectRecurring(): { window: { from: string; to: string }; groups: Group[] } {
  const to = getDataToday();
  const from = addDays(to, -364);
  const byKey = new Map<string, Transaction[]>();
  for (const t of getTransactions({ from, to })) {
    if (t.amountEur >= 0) continue;
    const saving = categoryKind(t.category) === "savings_move";
    if (!saving && !isSpending(t)) continue;
    const key = t.merchantId || `cat:${t.category}`;
    byKey.set(key, [...(byKey.get(key) ?? []), t]);
  }

  const groups: Group[] = [];
  for (const [key, txs] of byKey) {
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

    groups.push({
      txs,
      variation,
      item: {
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
      },
    });
  }
  return { window: { from, to }, groups };
}

export function recurringPayments(): {
  window: { from: string; to: string };
  items: RecurringItem[];
  rows: ChartRow[];
} {
  const { window, groups } = detectRecurring();
  const items = groups.map((g) => g.item);
  const order: RecurringKind[] = ["bill", "subscription", "automatic_saving", "habit"];
  items.sort(
    (a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || b.perMonthEur - a.perMonthEur,
  );
  // Keep the list short: all bills/subscriptions/savings + the top 5 habits.
  const habits = items.filter((i) => i.kind === "habit").slice(0, 5);
  const kept = [...items.filter((i) => i.kind !== "habit"), ...habits];

  return {
    window,
    items: kept,
    rows: kept.map((i) => ({
      label: `${i.name} (${i.kind.replace("_", " ")})`,
      value: i.perMonthEur,
    })),
  };
}

/** WHY 5 %: below that a payment is "the same amount every time" (rounding, small price changes). */
const STEADY_AMOUNT = 0.05;

const ordinal = (n: number) =>
  `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/** Why this payment counts as recurring, in plain words (shown when a payment is opened). */
function reasonFor(g: Group): string {
  const i = g.item;
  const when = `usually around the ${ordinal(i.typicalDayOfMonth)}`;
  const seen = `${i.monthsSeen} of the last 12 months`;
  const perMonth = Math.round(i.timesSeen / i.monthsSeen);
  const often = perMonth >= 2 ? ` It often comes about ${perMonth} times a month; this is the next one.` : "";
  if (i.kind === "bill")
    return `Paid in ${seen}, ${when}. It's a ${i.category.toLowerCase()} payment: a bill that comes back every month.${often}`;
  if (i.kind === "subscription") {
    const price =
      g.variation < 0.01 ? "the same price every time" : `a steady price (it varies by about ${Math.round(g.variation * 100)} %)`;
    return `Paid to the same merchant in ${seen}, ${when}, at ${price}.`;
  }
  return `A transfer to your own savings or investments in ${seen}, ${when}.${often}`;
}

/**
 * Bills, subscriptions and automatic savings expected in the next `days` days (Home tab, and
 * safe_to_spend counts the ones before payday).
 * WHY these are PREDICTIONS (status "predicted"): the data has no due dates or scheduled
 * payments. The date is the payment's usual day of the month (median of the last 12 months);
 * the amount is the last payment when it's always (almost) the same, else the average — then
 * `amountIsEstimate` is true and the UI shows "≈" and the range. Nothing here is guaranteed.
 * Habits are left out: a favourite restaurant isn't a payment you must plan for.
 */
export function upcomingPayments(days = 31): UpcomingPayment[] {
  const today = getDataToday();
  const out: UpcomingPayment[] = [];
  for (const g of detectRecurring().groups) {
    const i = g.item;
    if (i.kind === "habit") continue;
    const date = nextDayOfMonth(today, i.typicalDayOfMonth);
    const inDays = Math.round((toDate(date).getTime() - toDate(today).getTime()) / 86_400_000);
    if (inDays > days) continue;
    const amounts = g.txs.map((t) => -t.amountEur);
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    const steady = max - min <= max * STEADY_AMOUNT;
    const last = g.txs[g.txs.length - 1];
    const daysOfMonth = g.txs.map((t) => Number(t.date.slice(8, 10)));
    out.push({
      name: withoutMerchantId(i.name),
      category: i.category,
      kind: i.kind,
      status: "predicted",
      date,
      inDays,
      amountEur: steady ? round2(-last.amountEur) : i.averageAmountEur,
      amountIsEstimate: !steady,
      minAmountEur: round2(min),
      maxAmountEur: round2(max),
      dayRange: [Math.min(...daysOfMonth), Math.max(...daysOfMonth)],
      monthsSeen: i.monthsSeen,
      reason: reasonFor(g),
      history: g.txs
        .map((t) => ({ date: t.date, amountEur: round2(-t.amountEur) }))
        .reverse(),
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
