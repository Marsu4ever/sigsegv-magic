/**
 * what_if — "How much could I save if I cut dining out by 20%?"
 * Owner: INSIGHTS person.
 *
 * Takes the average MONTHLY spending (in a category, merchant type or basket)
 * over a recent period and applies a percentage change.
 * Negative change = cutting back (e.g. −20).
 */
import type { Basket, ChartRow, DateRange } from "@/lib/types";
import { BASKET_LABELS } from "@/lib/types";
import { basketBreakdown, round2, spendByCategory } from "@/lib/data";
import { monthsInRange } from "@/lib/data/money";

export function whatIf(opts: {
  range: DateRange;
  changePercent: number; // −20 = spend 20 % less
  category?: string; // e.g. "restaurants" or "taxi"
  basket?: Basket;
}) {
  const months = monthsInRange(opts.range);
  let total: number;
  let what: string;
  if (opts.basket) {
    total = basketBreakdown(opts.range)[opts.basket];
    what = BASKET_LABELS[opts.basket];
  } else {
    const rows = spendByCategory(opts.range, opts.category);
    total = rows.reduce((s, r) => s + r.value, 0);
    what = opts.category ? rows.map((r) => r.label).join(" + ") || opts.category : "All spending";
  }
  const perMonthNow = total / months;
  const perMonthAfter = perMonthNow * (1 + opts.changePercent / 100);
  const savingPerMonth = perMonthNow - perMonthAfter;

  const rows: ChartRow[] = [
    { label: "Now (per month)", value: round2(perMonthNow) },
    {
      label: `After ${opts.changePercent > 0 ? "+" : ""}${opts.changePercent} %`,
      value: round2(perMonthAfter),
    },
  ];
  return {
    what,
    basedOn: opts.range,
    months,
    changePercent: opts.changePercent,
    perMonthNowEur: round2(perMonthNow),
    perMonthAfterEur: round2(perMonthAfter),
    savingPerMonthEur: round2(savingPerMonth),
    savingPerYearEur: round2(savingPerMonth * 12),
    rows,
  };
}
