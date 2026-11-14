/**
 * what_if — "How much would I save if I skipped one cafe visit a week / cut taxis by 20%?"
 * Owner: INSIGHTS person.
 *
 * Takes the average MONTHLY spending (in a category, merchant type or basket)
 * over a recent period and applies a percentage change.
 * Negative change = cutting back (e.g. −20).
 *
 * WHY next to what_if_spending (whatIfForecast.ts): same 90-day basis as everyday_leaks, so a
 * "skip one" follow-up to the leaks chart shows the same saving as the habit card did.
 * The chat draws its result as a bar chart: as now vs with the change, for the next month,
 * 3 months and 6 months side by side (DECISIONS.md #44).
 */
import type { Basket, ChartRow, DateRange, ForecastMonths } from "@/lib/types";
import { BASKET_LABELS, FORECAST_LABELS, FORECAST_MONTHS } from "@/lib/types";
import {
  basketBreakdown,
  clampToHistory,
  getTransactions,
  isSpending,
  round2,
  spendByCategory,
  spentEur,
} from "@/lib/data";
import { habitName } from "./leaks";
import { monthsInRange } from "@/lib/data/money";

export function whatIf(opts: {
  range: DateRange;
  changePercent: number; // −20 = spend 20 % less
  category?: string; // e.g. "restaurants" or "taxi"
  basket?: Basket;
  /** An everyday_leaks habit, matched exactly like its card (used by skip_one). Beats category. */
  habit?: string;
  /** Name of the "after" bars instead of "20% less", e.g. "Skip 1 a week". */
  afterLabel?: string;
}) {
  // WHY clamp: with less history than the period, average over what the customer has.
  const range = clampToHistory(opts.range);
  const months = monthsInRange(range);
  let total: number;
  let what: string;
  if (opts.habit) {
    total = 0;
    for (const t of getTransactions(range)) {
      if (isSpending(t) && t.basket === "everyday" && habitName(t) === opts.habit) total += spentEur(t);
    }
    what = opts.habit;
  } else if (opts.basket) {
    total = basketBreakdown(range)[opts.basket];
    what = BASKET_LABELS[opts.basket];
  } else {
    const rows = spendByCategory(range, opts.category);
    total = rows.reduce((s, r) => s + r.value, 0);
    what = opts.category ? rows.map((r) => r.label).join(" + ") || opts.category : "All spending";
  }
  const perMonthNow = total / months;
  const perMonthAfter = perMonthNow * (1 + opts.changePercent / 100);
  const savingPerMonth = perMonthNow - perMonthAfter;

  // WHY all three periods: "how does that add up over 3 or 6 months?" is the usual follow-up,
  // and the AI must never multiply by itself (prompt rule 3).
  const periods = FORECAST_MONTHS.map((m: ForecastMonths) => ({
    months: m,
    nowEur: round2(perMonthNow * m),
    afterEur: round2(perMonthAfter * m),
    savingEur: round2(savingPerMonth * m), // negative = spending more
  }));

  const cut = opts.changePercent <= 0;
  const pct = Math.abs(opts.changePercent);
  // One bar pair per period: as now (red) vs after the change (green for a cut).
  // WHY tone set here: value2 needs its own color (tone2), which the generic rowTone can't give.
  const rows: ChartRow[] = periods.map((p) => ({
    label: FORECAST_LABELS[p.months],
    value: p.nowEur,
    value2: p.afterEur,
    tone: "out",
    tone2: cut ? "in" : "out",
  }));
  const after = opts.afterLabel ?? `${pct}% ${cut ? "less" : "more"}`;
  return {
    what,
    basedOn: range, // shorter than asked = the customer's whole history
    ...(total === 0
      ? { note: `No spending on ${what} in this period, so nothing to save. everyday_leaks lists what they do spend on.` }
      : {}),
    months,
    changePercent: round2(opts.changePercent),
    perMonthNowEur: round2(perMonthNow),
    perMonthAfterEur: round2(perMonthAfter),
    savingPerMonthEur: round2(savingPerMonth),
    savingPerYearEur: round2(savingPerMonth * 12),
    periods,
    // WHY no rows when nothing was spent: a chart of zero bars looks like a bug.
    rows: total === 0 ? [] : rows,
    seriesNames: ["As now", after] as [string, string],
  };
}
