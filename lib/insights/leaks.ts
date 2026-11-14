/**
 * everyday_leaks — "where does my money slip away?" Owner: INSIGHTS person.
 *
 * Looks only at the EVERYDAY basket and shows (1) which kinds of purchases
 * add up the most per month and (2) how much SMALL purchases (≤ €20 by
 * default) add up to per month and per year — the classic "coffee effect".
 *
 * WHY €20: in the dataset, 40 % of everyday purchases are under ~€21.
 *
 * Also returns `view` for the "leaks" chart: the yearly headline, the two
 * leakiest weekdays, habit cards with "skip one" savings, and every small
 * everyday purchase (the marbles in the jar; skipping a habit turns its
 * marbles green on screen).
 *
 * SKIP ONE (always leaves some of the habit — it's a nudge, not a ban):
 *   ≥ 6× a month   → "Skip 1 a week"   (52 × average)
 *   ≥ 2× a month   → "Skip 1 a month"  (12 × average)
 *   ≥ 0.5× a month → "Skip every 2nd"  (half the yearly cost)
 *   rarer          → no chip
 */
import type { ChartRow, DateRange, LeaksView } from "@/lib/types";
import { getTransactions, isSpending, merchantType, round2, spentEur } from "@/lib/data";
import { monthsInRange } from "@/lib/data/money";

export const SMALL_PURCHASE_MAX_EUR = 20;

export function everydayLeaks(range: DateRange, smallMaxEur = SMALL_PURCHASE_MAX_EUR) {
  const months = monthsInRange(range);
  const groups = new Map<
    string,
    { count: number; total: number; categories: Map<string, number> }
  >();
  const byWeekday = new Array(7).fill(0); // 0 = Sunday
  const drops: { date: string; amount: number; habit: string }[] = [];
  let everyday = 0;
  let smallCount = 0;
  let smallTotal = 0;

  for (const t of getTransactions(range)) {
    if (!isSpending(t) || t.basket !== "everyday") continue;
    const eur = spentEur(t);
    everyday += eur;
    const key = merchantType(t.mccCode) ?? t.category;
    const g = groups.get(key) ?? { count: 0, total: 0, categories: new Map() };
    g.count++;
    g.total += eur;
    g.categories.set(t.category, (g.categories.get(t.category) ?? 0) + 1);
    groups.set(key, g);
    byWeekday[new Date(t.date.slice(0, 10) + "T00:00:00Z").getUTCDay()] += eur;
    drops.push({ date: t.date.slice(0, 10), amount: round2(eur), habit: key });
    if (eur <= smallMaxEur) {
      smallCount++;
      smallTotal += eur;
    }
  }

  const list = [...groups]
    .map(([name, g]) => ({
      name,
      // The category this habit mostly falls in (for its icon).
      category: [...g.categories].sort((a, b) => b[1] - a[1])[0]?.[0] ?? name,
      timesPerMonth: round2(g.count / months),
      averageEur: round2(g.total / g.count),
      perMonthEur: round2(g.total / months),
      perYearEur: round2((g.total / months) * 12),
    }))
    .sort((a, b) => b.perMonthEur - a.perMonthEur);

  const rows: ChartRow[] = list.slice(0, 8).map((g) => ({ label: g.name, value: g.perMonthEur }));

  // Leakiest two weekdays by everyday euros.
  const DAY = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
  const ranked = byWeekday.map((v, i) => ({ i, v })).sort((a, b) => b.v - a.v);
  const leakiestDays: LeaksView["leakiestDays"] =
    everyday > 0
      ? {
          days: [DAY[ranked[0].i], DAY[ranked[1].i]],
          share: round2((ranked[0].v + ranked[1].v) / everyday),
        }
      : null;

  const view: LeaksView = {
    everydayPerYearEur: round2((everyday / months) * 12),
    smallMaxEur,
    smallPerYearEur: round2((smallTotal / months) * 12),
    smallCount,
    smallTotalEur: round2(smallTotal),
    periodDays: Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000) + 1,
    leakiestDays,
    habits: list.slice(0, 8).map((g) => {
      const skip =
        g.timesPerMonth >= 6
          ? { label: "Skip 1 a week", savesPerYearEur: g.averageEur * 52 }
          : g.timesPerMonth >= 2
            ? { label: "Skip 1 a month", savesPerYearEur: g.averageEur * 12 }
            : g.timesPerMonth >= 0.5
              ? { label: "Skip every 2nd", savesPerYearEur: g.perYearEur / 2 }
              : null;
      return {
        name: g.name,
        category: g.category,
        timesPerMonth: g.timesPerMonth,
        averageEur: g.averageEur,
        perYearEur: g.perYearEur,
        skip: skip && { label: skip.label, savesPerYearEur: round2(skip.savesPerYearEur) },
      };
    }),
    drops: drops.sort((a, b) => a.date.localeCompare(b.date)),
  };

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
    // WHY drop category here: the AI only needs the merchant type.
    groups: list.slice(0, 8).map((g) => ({
      name: g.name,
      timesPerMonth: g.timesPerMonth,
      averageEur: g.averageEur,
      perMonthEur: g.perMonthEur,
      perYearEur: g.perYearEur,
    })),
    rows, // per-month euros by purchase type
    view, // for the "leaks" chart (not sent to the AI)
  };
}
