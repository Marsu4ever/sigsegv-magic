/**
 * everyday_leaks — "where does my money slip away?" Owner: INSIGHTS person.
 *
 * Looks only at the EVERYDAY basket and shows (1) which kinds of purchases
 * add up the most per month and (2) how much SMALL purchases (≤ €20 by
 * default) add up to per month and per year — the classic "coffee effect".
 *
 * WHY €20: in the dataset, 40 % of everyday purchases are under ~€21.
 */
import type { ChartRow, DateRange } from "@/lib/types";
import { getTransactions, isSpending, merchantType, round2, spentEur } from "@/lib/data";
import { monthsInRange } from "@/lib/data/money";

export const SMALL_PURCHASE_MAX_EUR = 20;

export function everydayLeaks(range: DateRange, smallMaxEur = SMALL_PURCHASE_MAX_EUR) {
  const months = monthsInRange(range);
  const groups = new Map<string, { count: number; total: number }>();
  let everyday = 0;
  let smallCount = 0;
  let smallTotal = 0;

  for (const t of getTransactions(range)) {
    if (!isSpending(t) || t.basket !== "everyday") continue;
    const eur = spentEur(t);
    everyday += eur;
    const key = merchantType(t.mccCode) ?? t.category;
    const g = groups.get(key) ?? { count: 0, total: 0 };
    g.count++;
    g.total += eur;
    groups.set(key, g);
    if (eur <= smallMaxEur) {
      smallCount++;
      smallTotal += eur;
    }
  }

  const list = [...groups]
    .map(([name, g]) => ({
      name,
      timesPerMonth: round2(g.count / months),
      averageEur: round2(g.total / g.count),
      perMonthEur: round2(g.total / months),
      perYearEur: round2((g.total / months) * 12),
    }))
    .sort((a, b) => b.perMonthEur - a.perMonthEur);

  const rows: ChartRow[] = list.slice(0, 8).map((g) => ({ label: g.name, value: g.perMonthEur }));

  return {
    range,
    months,
    everydayPerMonthEur: round2(everyday / months),
    everydayPerYearEur: round2((everyday / months) * 12),
    smallPurchases: {
      maxEur: smallMaxEur,
      count: smallCount,
      timesPerMonth: round2(smallCount / months),
      perMonthEur: round2(smallTotal / months),
      perYearEur: round2((smallTotal / months) * 12),
    },
    groups: list.slice(0, 8),
    rows, // per-month euros by purchase type
  };
}
