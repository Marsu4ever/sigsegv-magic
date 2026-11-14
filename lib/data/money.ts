/**
 * More building-block queries (income, comparisons, biggest costs, balance).
 * Owner: DATA person. SERVER ONLY. Used by AI tools in lib/ai/tools.ts.
 * Same rules as lib/data/index.ts: plain data out, all math here.
 */
import type { Basket, ChartRow, DateRange, Transaction } from "@/lib/types";
import { addDays } from "./dates";
import {
  categoryKind,
  getTransactions,
  isIncome,
  isSpending,
  round2,
  spendByCategory,
  spentEur,
} from "./index";
import { merchantType } from "./merchantTypes";

/** Calendar months touched by a range, e.g. 1 Jan–31 Mar = 3. */
export function monthsInRange(range: DateRange): number {
  const [y1, m1] = range.from.split("-").map(Number);
  const [y2, m2] = range.to.split("-").map(Number);
  return Math.max(1, (y2 - y1) * 12 + (m2 - m1) + 1);
}

// ─── income_summary ──────────────────────────────────────────────────────

export type IncomeSummary = {
  range: DateRange;
  incomeEur: number;
  spendingEur: number;
  keptEur: number; // income − spending
  keptShare: number; // kept / income, e.g. 0.12 = 12 %
  movedToSavingsEur: number; // investment deposits & salary sweeps (already inside "kept")
  rows: ChartRow[];
};

/** Income vs spending in a range, and how much was kept. */
export function incomeSummary(range: DateRange): IncomeSummary {
  let income = 0;
  let spending = 0;
  let toSavings = 0;
  for (const t of getTransactions(range)) {
    if (isIncome(t)) income += t.amountEur;
    else if (isSpending(t)) spending += spentEur(t);
    else if (categoryKind(t.category) === "savings_move" && t.amountEur < 0)
      toSavings -= t.amountEur;
  }
  const kept = income - spending;
  return {
    range,
    incomeEur: round2(income),
    spendingEur: round2(spending),
    keptEur: round2(kept),
    keptShare: income ? round2(kept / income) : 0,
    movedToSavingsEur: round2(toSavings),
    rows: [
      { label: "Income", value: round2(income) },
      { label: "Spending", value: round2(spending) },
      { label: "Kept", value: round2(kept) },
    ],
  };
}

// ─── compare_periods ─────────────────────────────────────────────────────

/**
 * Spending per category in two ranges, side by side (value = A, value2 = B).
 * First row is the total. Sorted by the bigger of the two.
 */
export function comparePeriods(a: DateRange, b: DateRange, category?: string): ChartRow[] {
  const ra = new Map(spendByCategory(a, category).map((r) => [r.label, r.value]));
  const rb = new Map(spendByCategory(b, category).map((r) => [r.label, r.value]));
  const labels = [...new Set([...ra.keys(), ...rb.keys()])];
  const rows = labels
    .map((label) => ({ label, value: ra.get(label) ?? 0, value2: rb.get(label) ?? 0 }))
    .sort((x, y) => Math.max(y.value, y.value2) - Math.max(x.value, x.value2));
  const total = {
    label: "Total",
    value: round2(rows.reduce((s, r) => s + r.value, 0)),
    value2: round2(rows.reduce((s, r) => s + r.value2, 0)),
  };
  return [total, ...rows];
}

// ─── largest_transactions ────────────────────────────────────────────────

/** The biggest single spending transactions in a range. */
export function largestTransactions(
  range: DateRange,
  opts: { limit?: number; basket?: Basket } = {},
): Transaction[] {
  return getTransactions(range)
    .filter((t) => isSpending(t) && (!opts.basket || t.basket === opts.basket))
    .sort((x, y) => spentEur(y) - spentEur(x))
    .slice(0, opts.limit ?? 10);
}

/** Chart rows for largest transactions: "23.9. Entertainment (Cinema)" → €. */
export function transactionRows(txs: Transaction[]): ChartRow[] {
  return txs.map((t) => {
    const [, m, d] = t.date.split("-").map(Number);
    const mt = merchantType(t.mccCode);
    return { label: `${d}.${m}. ${t.category}${mt ? ` (${mt})` : ""}`, value: round2(spentEur(t)) };
  });
}

// ─── balance_over_time ───────────────────────────────────────────────────

export type BalanceSeries = {
  range: DateRange;
  rows: ChartRow[]; // one row per day: end-of-day balance (label = date)
  lowest: { date: string; balanceEur: number } | null;
  highest: { date: string; balanceEur: number } | null;
};

/**
 * Account balance at the end of each day (from balance_after_eur).
 * Days without transactions carry the previous balance forward.
 * WHY: shows the "end of month squeeze" — how low money gets before payday.
 */
export function balanceOverTime(range: DateRange): BalanceSeries {
  const all = getTransactions(); // need history before the range for the start balance
  const endOfDay = new Map<string, number>();
  for (const t of all) endOfDay.set(t.date, t.balanceAfterEur); // sorted → last one wins
  // Start balance: the last known balance before the range.
  let current: number | null = null;
  for (const t of all) {
    if (t.date < range.from) current = t.balanceAfterEur;
    else break;
  }
  const rows: ChartRow[] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) {
    if (endOfDay.has(d)) current = endOfDay.get(d)!;
    if (current !== null) rows.push({ label: d, value: round2(current) });
  }
  const pick = (cmp: (a: number, b: number) => boolean) =>
    rows.reduce<ChartRow | null>((best, r) => (!best || cmp(r.value, best.value) ? r : best), null);
  const lo = pick((a, b) => a < b);
  const hi = pick((a, b) => a > b);
  return {
    range,
    rows,
    lowest: lo ? { date: lo.label, balanceEur: lo.value } : null,
    highest: hi ? { date: hi.label, balanceEur: hi.value } : null,
  };
}
