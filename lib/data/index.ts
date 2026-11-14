/**
 * DATA FUNCTIONS — the single source of truth for every number in the app.
 * Owner: DATA person. SERVER ONLY.
 *
 * WHY one place: the AI tools (lib/ai/tools.ts) and the Week tab
 * (app/api/week) both call these same functions, so the chat and the
 * Week tab can never disagree about a number.
 *
 * All functions return plain data. They never format text for humans —
 * that is the AI's / UI's job.
 */
import type {
  Basket,
  ChartRow,
  DateRange,
  Transaction,
  WeekSummary,
} from "@/lib/types";
import { BASKETS } from "@/lib/types";
import {
  addDays,
  inRange,
  resolvePeriod,
  startOfMonth,
  startOfWeek,
  weekdayLabel,
  type Period,
} from "./dates";
import { loadCustomerData } from "./load";

export { getCustomerId } from "./load";
export { PERIODS, type Period } from "./dates";

// ─── Basics ──────────────────────────────────────────────────────────────

/**
 * ⚠️ ASSUMPTION (verify with real data): spending is a NEGATIVE amount,
 * income is positive — the usual bank-statement convention.
 * If the real data uses positive amounts + transaction_type instead,
 * this function and spentEur() are the only places to change.
 */
export function isSpending(t: Transaction): boolean {
  return t.amountEur < 0;
}

/** How much was spent, as a positive number of euros. */
export function spentEur(t: Transaction): number {
  return isSpending(t) ? -t.amountEur : 0;
}

/**
 * "Today" inside the dataset = the date of the latest transaction.
 * WHY: the data is synthetic, so the real calendar date is meaningless here.
 */
export function getDataToday(): string {
  const txs = loadCustomerData().transactions;
  return txs.length ? txs[txs.length - 1].date : new Date().toISOString().slice(0, 10);
}

function getDataFirstDay(): string {
  const txs = loadCustomerData().transactions;
  return txs.length ? txs[0].date : getDataToday();
}

export function periodToRange(period: Period): DateRange {
  return resolvePeriod(period, getDataToday(), getDataFirstDay());
}

export function getCustomer() {
  return loadCustomerData().customer;
}

export function getTransactions(range?: DateRange): Transaction[] {
  const txs = loadCustomerData().transactions;
  return range ? txs.filter((t) => inRange(t.date, range)) : txs;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sortDesc(rows: ChartRow[]): ChartRow[] {
  return rows.sort((a, b) => b.value - a.value);
}

/** List of all category names this customer has, for the AI to match against. */
export function listCategories(): string[] {
  return [...new Set(loadCustomerData().transactions.map((t) => t.category))].sort();
}

// ─── Queries (used by AI tools and the Week tab) ─────────────────────────

/**
 * Total spent per category in a range, biggest first.
 * If `category` is given, only categories containing that text
 * (case-insensitive), e.g. "taxi".
 */
export function spendByCategory(range: DateRange, category?: string): ChartRow[] {
  const needle = category?.trim().toLowerCase();
  const totals = new Map<string, number>();
  for (const t of getTransactions(range)) {
    if (!isSpending(t)) continue;
    if (needle && !t.category.toLowerCase().includes(needle)) continue;
    totals.set(t.category, (totals.get(t.category) ?? 0) + spentEur(t));
  }
  return sortDesc(
    [...totals].map(([label, value]) => ({ label, value: round2(value) })),
  );
}

/** Total spent per basket in a range. Always returns all 3 baskets. */
export function basketBreakdown(range: DateRange): Record<Basket, number> {
  const totals = Object.fromEntries(BASKETS.map((b) => [b, 0])) as Record<Basket, number>;
  for (const t of getTransactions(range)) {
    if (isSpending(t)) totals[t.basket] += spentEur(t);
  }
  for (const b of BASKETS) totals[b] = round2(totals[b]);
  return totals;
}

/**
 * Spending over time, grouped by day, week or month.
 * Label is the first day of each bucket ("YYYY-MM-DD"). Empty buckets are 0,
 * so line charts don't skip gaps.
 */
export function spendOverTime(
  range: DateRange,
  groupBy: "day" | "week" | "month",
  category?: string,
): ChartRow[] {
  const bucketOf = (d: string) =>
    groupBy === "day" ? d : groupBy === "week" ? startOfWeek(d) : startOfMonth(d);

  const totals = new Map<string, number>();
  // Pre-fill every bucket in the range with 0.
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) {
    totals.set(bucketOf(d), 0);
  }
  const needle = category?.trim().toLowerCase();
  for (const t of getTransactions(range)) {
    if (!isSpending(t)) continue;
    if (needle && !t.category.toLowerCase().includes(needle)) continue;
    const key = bucketOf(t.date);
    totals.set(key, (totals.get(key) ?? 0) + spentEur(t));
  }
  return [...totals].map(([label, value]) => ({ label, value: round2(value) }));
}

/** The most recent transactions in a range (newest first), optionally filtered. */
export function listTransactions(
  range: DateRange,
  opts: { category?: string; basket?: Basket; limit?: number } = {},
): Transaction[] {
  const needle = opts.category?.trim().toLowerCase();
  return getTransactions(range)
    .filter((t) => !needle || t.category.toLowerCase().includes(needle))
    .filter((t) => !opts.basket || t.basket === opts.basket)
    .reverse()
    .slice(0, opts.limit ?? 20);
}

// ─── Week tab ────────────────────────────────────────────────────────────

export function getWeekSummary(): WeekSummary {
  const range = periodToRange("this_week");
  const byBasket = basketBreakdown(range);
  const byDay = spendOverTime(range, "day").map((r) => ({
    label: weekdayLabel(r.label),
    value: r.value,
  }));
  return {
    range,
    totalSpentEur: round2(BASKETS.reduce((sum, b) => sum + byBasket[b], 0)),
    byBasket,
    byDay,
    topCategories: spendByCategory(range).slice(0, 5),
  };
}
