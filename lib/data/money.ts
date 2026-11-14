/**
 * More building-block queries (income, comparisons, biggest costs, balance).
 * Owner: DATA person. SERVER ONLY. Used by AI tools in lib/ai/tools.ts.
 * Same rules as lib/data/index.ts: plain data out, all math here.
 */
import type { Basket, ChartRow, DateRange, Transaction } from "@/lib/types";
import { addDays, startOfMonth, startOfWeek } from "./dates";
import {
  categoryKind,
  getTransactions,
  isIncome,
  isSpending,
  matchLabel,
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

// ─── money_over_time ─────────────────────────────────────────────────────

export const MONEY_MEASURES = [
  "income",
  "spending",
  "kept",
  "income_vs_spending",
  "balance",
] as const;
export type MoneyMeasure = (typeof MONEY_MEASURES)[number];

export type MoneyOverTime = {
  range: DateRange;
  measure: MoneyMeasure;
  groupBy: "day" | "week" | "month";
  /** One row per day/week/month. label = first day of the bucket ("2026-03-01"). */
  rows: ChartRow[];
  seriesNames?: [string, string];
  /** Sums and extremes, so the AI never adds up numbers itself. */
  summary: Record<string, unknown>;
};

/**
 * Income, spending, kept (income − spending) or balance per day / week / month.
 * The general "ask anything over time" building block: any range, any grouping,
 * optional category / basket filter (spending only).
 * WHY one function: lets the AI answer "income last 7 months", "kept per month
 * this year", "restaurants per week" with one tool instead of many narrow ones.
 */
export function moneyOverTime(
  range: DateRange,
  measure: MoneyMeasure,
  groupBy: "day" | "week" | "month",
  filter: { category?: string; basket?: Basket } = {},
): MoneyOverTime {
  const bucketOf = (d: string) =>
    groupBy === "day" ? d : groupBy === "week" ? startOfWeek(d) : startOfMonth(d);
  const buckets: string[] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) {
    const b = bucketOf(d);
    if (buckets[buckets.length - 1] !== b) buckets.push(b);
  }

  if (measure === "balance") {
    // End-of-bucket balance (the last day of each bucket).
    const daily = balanceOverTime(range).rows;
    const last = new Map<string, number>();
    for (const r of daily) last.set(bucketOf(r.label), r.value);
    const rows = buckets.filter((b) => last.has(b)).map((b) => ({ label: b, value: last.get(b)! }));
    return { range, measure, groupBy, rows, summary: summarize(rows, "balanceEur", false) };
  }

  const income = new Map<string, number>(buckets.map((b) => [b, 0]));
  const spending = new Map<string, number>(buckets.map((b) => [b, 0]));
  const needle = filter.category?.trim().toLowerCase();
  for (const t of getTransactions(range)) {
    const b = bucketOf(t.date);
    if (isIncome(t)) {
      income.set(b, (income.get(b) ?? 0) + t.amountEur);
    } else if (isSpending(t)) {
      if (needle && !matchLabel(t, needle)) continue;
      if (filter.basket && t.basket !== filter.basket) continue;
      spending.set(b, (spending.get(b) ?? 0) + spentEur(t));
    }
  }
  const inc = (b: string) => round2(income.get(b) ?? 0);
  const out = (b: string) => round2(spending.get(b) ?? 0);

  if (measure === "income_vs_spending") {
    const rows: ChartRow[] = buckets.map((b) => ({
      label: b,
      value: inc(b),
      value2: out(b),
      tone: "in",
      tone2: "out",
    }));
    const totalIn = round2(rows.reduce((s, r) => s + r.value, 0));
    const totalOut = round2(rows.reduce((s, r) => s + (r.value2 ?? 0), 0));
    return {
      range,
      measure,
      groupBy,
      rows,
      seriesNames: ["Income", "Spending"],
      summary: {
        periods: rows.length,
        totalIncomeEur: totalIn,
        totalSpendingEur: totalOut,
        totalKeptEur: round2(totalIn - totalOut),
        averageIncomeEur: rows.length ? round2(totalIn / rows.length) : 0,
        averageSpendingEur: rows.length ? round2(totalOut / rows.length) : 0,
        periodsSpentMoreThanEarned: rows.filter((r) => (r.value2 ?? 0) > r.value).map((r) => r.label),
      },
    };
  }

  const rows: ChartRow[] = buckets.map((b) => {
    const value = measure === "income" ? inc(b) : measure === "spending" ? out(b) : round2(inc(b) - out(b));
    const tone = measure === "spending" || value < 0 ? "out" : "in";
    return { label: b, value, tone };
  });
  const key = measure === "income" ? "incomeEur" : measure === "spending" ? "spendingEur" : "keptEur";
  return { range, measure, groupBy, rows, summary: summarize(rows, key, true) };
}

/** Total, average, highest and lowest of a series — so the AI doesn't do the math. */
export function summarize(rows: ChartRow[], key: string, withTotal: boolean): Record<string, unknown> {
  if (rows.length === 0) return { periods: 0 };
  const total = rows.reduce((s, r) => s + r.value, 0);
  const hi = rows.reduce((a, r) => (r.value > a.value ? r : a));
  const lo = rows.reduce((a, r) => (r.value < a.value ? r : a));
  return {
    periods: rows.length,
    ...(withTotal ? { [`total_${key}`]: round2(total) } : {}),
    [`average_${key}`]: round2(total / rows.length),
    highest: { period: hi.label, [key]: hi.value },
    lowest: { period: lo.label, [key]: lo.value },
    first: { period: rows[0].label, [key]: rows[0].value },
    last: { period: rows[rows.length - 1].label, [key]: rows[rows.length - 1].value },
  };
}
