/**
 * "What if I spent X% less on <target>?" — the what-if view (chart + toggle).
 * Owner: INSIGHTS. SERVER ONLY.
 *
 * The ONLY place the what-if view's numbers are calculated — used by the AI tool
 * what_if_spending and by GET /api/what-if (toggle + buttons, no AI).
 * Rules: PLAN-what-if-forecast.md §3 and DECISIONS.md #24–#25.
 *
 * PREDICTION (DECISIONS.md #34): the next N months (N = 1, 3 or 6) = the target's average month
 * × N. Average = the last 12 months, or all the history when it is shorter (≥ 1 month needed).
 * CHART: the past line still shows the last N months (short history → 3 or 1 months); the dashed
 * lines replay those days, scaled to the estimate. No spending in those months → the estimate still
 * comes from the average and the dashed lines are straight. Empty state only when the average is 0.
 * LAST YEAR: the same N months a year ago are reported (WhatIf.lastYear) for the coach to mention,
 * but not used in the estimate — a backtest showed they made it less accurate on top of the average.
 * DEFAULT TARGET: the customer's biggest everyday-basket group (getDefaultTarget) — the chip
 * "What if I spent less on X?" and the AI's fallback when X is unclear (DECISIONS.md #27).
 *
 * WHY a separate file from whatIf.ts: whatIf.ts is the "average per month × %" tool (what_if)
 * for a habit's saving over the last 90 days, drawn as bars (DECISIONS.md #44). This file is the
 * forecast view.
 */
import type {
  ChartRow,
  CutSaving,
  DateRange,
  ForecastMonths,
  LastYearSpending,
  MonthlyAverage,
  ProjectionPoint,
  SpendingTarget,
  TargetPurchase,
  Transaction,
  WhatIf,
} from "@/lib/types";
import { CUT_OPTIONS, FORECAST_MONTHS, cutOptionsWith } from "@/lib/types";
import {
  addDays,
  addMonths,
  daysInRange,
  getDataFirstDay,
  getDataToday,
  getTransactions,
  isSpending,
  merchantType,
  round2,
  spentEur,
} from "@/lib/data";
import { everydayGroups, FALLBACK_TARGET, matchesTarget, targetKey } from "./targets";
import { goalImpact } from "@/lib/goals/view";

export const DEFAULT_CUT_PCT = CUT_OPTIONS[0]; // 5 %
const TOP_CATEGORIES = 2; // WHY 2: fewer buttons keep the phone view calm
const AVERAGE_MONTHS = 12;
const DAYS_PER_MONTH = 365.25 / 12;

/** The past period of M months that ends today: (today − M months + 1 day) … today. */
function lookbackRange(today: string, months: ForecastMonths): DateRange {
  return { from: addDays(addMonths(today, -months), 1), to: today };
}

/** Next period's total and saving for one cut %. */
function cutTotals(noChangeEur: number, cutPct: number): CutSaving {
  const withCutEur = round2(noChangeEur * (1 - cutPct / 100));
  // WHY from the rounded values: the headline adds up
  return { cutPct, withCutEur, savingEur: round2(noChangeEur - withCutEur) };
}

/** Spent on the target in a date range. */
function targetSpent(txs: Transaction[], target: SpendingTarget, range: DateRange): number {
  let sum = 0;
  for (const t of txs) {
    if (isSpending(t) && t.date >= range.from && t.date <= range.to && matchesTarget(t, target)) {
      sum += spentEur(t);
    }
  }
  return sum;
}

/**
 * The target's average month over the last 12 months, or since the first day of data.
 * WHY 12 months, not the last N: one month is ruled by a single trip or big purchase, and the
 * default target is the category that was biggest LAST month — often an unusually heavy one.
 * Backtest (39 customers, DECISIONS.md #34): 1-month error 123 % → 92 %, over-estimate +52 % → +16 %.
 */
function monthlyAverage(
  txs: Transaction[],
  today: string,
  firstDay: string,
  target: SpendingTarget,
): MonthlyAverage {
  const yearAgo = addDays(addMonths(today, -AVERAGE_MONTHS), 1);
  const range: DateRange = { from: firstDay > yearAgo ? firstDay : yearAgo, to: today };
  // WHY count days, not calendar months (monthsInRange): a rolling year touches 13 calendar
  // months. A full year counts as exactly 12 (365 or 366 days).
  const months = range.from === yearAgo ? AVERAGE_MONTHS : daysInRange(range) / DAYS_PER_MONTH;
  return {
    range,
    months: Math.round(months * 10) / 10,
    perMonthEur: round2(targetSpent(txs, target, range) / months),
  };
}

/** The forecast window one year earlier — only when it is fully inside the history. */
function lastYearSpending(
  txs: Transaction[],
  firstDay: string,
  horizon: DateRange,
  target: SpendingTarget,
): LastYearSpending | null {
  const range: DateRange = { from: addMonths(horizon.from, -12), to: addMonths(horizon.to, -12) };
  // WHY only full coverage: it is shown as a fact ("you spent X"), so a part of it would mislead.
  if (firstDay > range.from) return null;
  return { range, spentEur: round2(targetSpent(txs, target, range)) };
}

function sortedRows(totals: Map<string, number>): ChartRow[] {
  return [...totals]
    .map(([label, value]) => ({ label, value: round2(value) }))
    .sort((a, b) => b.value - a.value);
}

/** §3.2 — one calculation for a fixed number of months. monthsWithData is filled in by buildWhatIf. */
function calculate(
  txs: Transaction[],
  today: string,
  firstDay: string,
  target: SpendingTarget,
  months: ForecastMonths,
  cutPct: number,
): WhatIf {
  const horizon: DateRange = { from: addDays(today, 1), to: addMonths(today, months) };
  // WHY largest first: use as much of the asked-for history as the customer has.
  const basedOn = ([6, 3, 1] as ForecastMonths[]).find(
    (m) => m <= months && firstDay <= lookbackRange(today, m).from,
  );
  if (!basedOn) {
    return {
      target,
      cutPct,
      months,
      monthsWithData: [],
      basedOnMonths: null,
      status: "not_enough_data",
      emptyReason: "short_history",
      today,
      lookback: null,
      horizon,
      pastEur: 0,
      noChangeEur: 0,
      withCutEur: 0,
      savingEur: 0,
      cutOptions: [],
      points: [],
      average: null,
      lastYear: null,
      breakdown: [],
      topCategories: [],
    };
  }

  const lookback = lookbackRange(today, basedOn);
  const daily: number[] = new Array(daysInRange(lookback)).fill(0);
  const byCategory = new Map<string, number>();
  const byMerchantType = new Map<string, number>();
  let past = 0;

  for (const t of txs) {
    if (!isSpending(t) || t.date < lookback.from || t.date > lookback.to) continue;
    if (!matchesTarget(t, target)) continue;
    const eur = spentEur(t);
    past += eur;
    daily[daysInRange({ from: lookback.from, to: t.date }) - 1] += eur;
    byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + eur);
    const mt = merchantType(t.mccCode) ?? `Other ${t.category.toLowerCase()}`;
    byMerchantType.set(mt, (byMerchantType.get(mt) ?? 0) + eur);
  }

  const pastEur = round2(past);
  const average = monthlyAverage(txs, today, firstDay, target);
  // WHY from the rounded per-month value: "typical month × N" adds up for the user.
  const noChangeEur = round2(average.perMonthEur * months);
  const { withCutEur, savingEur } = cutTotals(noChangeEur, cutPct);

  // WHY switch to merchant types: real data has only "Restaurants", so a split by
  // category would be one row; merchant types (Restaurant / Fast food / Bars) say more.
  const breakdown = sortedRows(byCategory.size > 1 ? byCategory : byMerchantType);
  // WHY leave out the shown target: the buttons are the NEXT options (the heading already
  // names this one), and a button for the target back always appears after switching.
  const shownKey = targetKey(target);
  const topCategories = everydayGroups(txs, lookback)
    .filter((o) => targetKey(o.target) !== shownKey)
    .slice(0, TOP_CATEGORIES);

  return {
    target,
    cutPct,
    months,
    monthsWithData: [],
    basedOnMonths: basedOn,
    status: basedOn === months ? "ok" : "fallback",
    emptyReason: null,
    today,
    lookback,
    horizon,
    pastEur,
    noChangeEur,
    withCutEur,
    savingEur,
    // WHY all options: the coach's message lists the saving for 5 / 10 / 20 % at once.
    cutOptions: cutOptionsWith(cutPct).map((c) => cutTotals(noChangeEur, c)),
    points: projectionPoints({
      daily,
      lookbackFrom: lookback.from,
      today,
      futureDays: daysInRange(horizon),
      pastEur,
      noChangeEur,
      keep: 1 - cutPct / 100,
      // WHY weekly points for 3 and 6 months: ~360 daily points are unreadable on a phone.
      step: months === 1 ? 1 : 7,
    }),
    average,
    lastYear: lastYearSpending(txs, firstDay, horizon, target),
    breakdown,
    topCategories,
  };
}

/**
 * §3.5 — running-total chart points.
 * Past: 0 € at the start, then the running total every `step` days (counted back from today).
 * Today: all three lines meet at pastEur.
 * Future: replays the past days' rhythm, scaled so it ends at pastEur + noChangeEur
 * (noChangeEur comes from the 12-month average, so the slope can change at today).
 * WHY replay, not a straight line: the dashed line then clearly reads as "the same again"
 * (weekend dinners show up). For smooth lines, make `raw` a constant.
 */
function projectionPoints(p: {
  daily: number[];
  lookbackFrom: string;
  today: string;
  futureDays: number;
  pastEur: number;
  noChangeEur: number;
  keep: number; // 1 − cut, e.g. 0.8
  step: number;
}): ProjectionPoint[] {
  const n = p.daily.length;
  const points: ProjectionPoint[] = [
    { date: addDays(p.lookbackFrom, -1), actual: 0, noChange: null, withCut: null },
  ];
  let sum = 0;
  for (let i = 0; i < n - 1; i++) {
    sum += p.daily[i];
    if ((n - 1 - i) % p.step === 0) {
      points.push({
        date: addDays(p.lookbackFrom, i),
        actual: round2(sum),
        noChange: null,
        withCut: null,
      });
    }
  }
  points.push({ date: p.today, actual: p.pastEur, noChange: p.pastEur, withCut: p.pastEur });

  const replay = Array.from({ length: p.futureDays }, (_, j) => p.daily[j % n]);
  // WHY a straight line when the past period had no spending: there is no rhythm to replay,
  // but the estimate (the 12-month average) is still there.
  const raw = replay.some((v) => v > 0) ? replay : replay.map(() => 1);
  const rawSum = raw.reduce((s, v) => s + v, 0);
  const k = rawSum > 0 ? p.noChangeEur / rawSum : 0;
  let cum = 0;
  for (let j = 0; j < p.futureDays; j++) {
    cum += raw[j] * k;
    if ((j + 1) % p.step === 0 || j === p.futureDays - 1) {
      points.push({
        date: addDays(p.today, j + 1),
        actual: null,
        noChange: round2(p.pastEur + cum),
        withCut: round2(p.pastEur + cum * p.keep),
      });
    }
  }
  return points;
}

/** §3.3 — empty state + monthsWithData. Pure: transactions (oldest first) + dates in, WhatIf out. */
export function buildWhatIf(
  txs: Transaction[],
  today: string,
  firstDay: string,
  target: SpendingTarget,
  months: ForecastMonths,
  cutPct: number,
): WhatIf {
  // WHY the average, not pastEur: no spending in the shown period still gives an estimate
  // from the last 12 months (DECISIONS.md #25 / #34). Only a 0 € average means nothing to predict.
  const hasData = (r: WhatIf) => r.status !== "not_enough_data" && (r.average?.perMonthEur ?? 0) > 0;
  // WHY check every period: the coach can then say "switch to 3 months" only when that is true.
  // Cheap: three passes over one customer's ~1000 transactions.
  const monthsWithData = FORECAST_MONTHS.filter((m) =>
    hasData(calculate(txs, today, firstDay, target, m, cutPct)),
  );
  let r = calculate(txs, today, firstDay, target, months, cutPct);
  if (r.status !== "not_enough_data" && !hasData(r)) {
    // WHY: no spending on the target in the last 12 months (or the whole shorter history) —
    // an all-zero chart says nothing, so show the 🙂 "Not enough data yet" state instead.
    r = {
      ...r,
      status: "not_enough_data",
      emptyReason: "no_spending",
      noChangeEur: 0,
      withCutEur: 0,
      savingEur: 0,
      points: [],
      cutOptions: [],
      average: null,
      lastYear: null,
    };
  }
  return { ...r, monthsWithData };
}

/**
 * The customer's biggest everyday-basket group — the chip's X and the default target.
 * WHY last month first: the view opens on Month, so X is what tops that view and the
 * buttons under it are #2–#3. Quiet last month → last 3, then 6 months; none at all → FALLBACK_TARGET.
 */
export function pickDefaultTarget(txs: Transaction[], today: string): SpendingTarget {
  for (const m of FORECAST_MONTHS) {
    const top = everydayGroups(txs, lookbackRange(today, m))[0];
    if (top) return top.target;
  }
  return FALLBACK_TARGET;
}

/** pickDefaultTarget for the current demo customer. */
export function getDefaultTarget(): SpendingTarget {
  return pickDefaultTarget(getTransactions(), getDataToday());
}

/** The what-if for the current demo customer. */
export function getWhatIf(
  target: SpendingTarget,
  months: ForecastMonths,
  cutPct = DEFAULT_CUT_PCT,
): WhatIf {
  const w = buildWhatIf(getTransactions(), getDataToday(), getDataFirstDay(), target, months, cutPct);
  // Saving goal set → "≈ N days closer to Lisbon" under "You'd save" (DECISIONS.md #60c).
  const impact = w.savingEur > 0 ? goalImpact(w.savingEur) : undefined;
  return impact ? { ...w, goalImpact: impact } : w;
}

/**
 * The target's purchases in a date range, newest first — the list behind a tapped point
 * on the what-if chart. Same matching (matchesTarget) as the chart, so the list adds up
 * to the solid line.
 */
export function getTargetPurchases(target: SpendingTarget, range: DateRange): TargetPurchase[] {
  return (
    getTransactions(range)
      .filter((t) => isSpending(t) && matchesTarget(t, target))
      // WHY sort by the raw timestamp: within one day the latest purchase still comes first.
      .sort((a, b) => b.date.localeCompare(a.date) || b.timestamp.localeCompare(a.timestamp))
      .map((t) => ({
        date: t.date,
        merchant: merchantType(t.mccCode) ?? t.category,
        amountEur: round2(spentEur(t)),
      }))
  );
}

/** "3" / 3 → 3; anything else → undefined. WHY: LLMs and URLs send strings or junk. */
export function parseMonths(v: unknown): ForecastMonths | undefined {
  const n = Number(v);
  return v !== null && v !== undefined && v !== "" && (FORECAST_MONTHS as number[]).includes(n)
    ? (n as ForecastMonths)
    : undefined;
}

/**
 * A whole % from 1 to 100 ("17", 17.4 or −17 → 17); junk, 0 or > 100 → DEFAULT_CUT_PCT.
 * WHY any %, not only CUT_OPTIONS: the coach can open the view on a % from the conversation
 * (e.g. a habit's "skip one" share); the panel then adds it as an extra circle (cutOptionsWith).
 * WHY abs: the older what_if tool uses −20 for "20 % less" and models mix the two up.
 */
export function parseCutPct(v: unknown): number {
  if (v === null || v === undefined || v === "") return DEFAULT_CUT_PCT;
  const n = Math.round(Math.abs(Number(v)));
  return Number.isFinite(n) && n >= 1 && n <= 100 ? n : DEFAULT_CUT_PCT;
}

/** Validate a target sent back by the UI (JSON). Anything malformed → null. */
export function parseTarget(json: string | null): SpendingTarget | null {
  if (!json) return null;
  let v: unknown;
  try {
    v = JSON.parse(json);
  } catch {
    return null;
  }
  const isStrings = (a: unknown): a is string[] =>
    Array.isArray(a) && a.every((x) => typeof x === "string");
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.label !== "string" || !o.label.trim()) return null;
  if (!isStrings(o.categories) || !isStrings(o.merchantTypes)) return null;
  if (!o.categories.length && !o.merchantTypes.length) return null;
  return { label: o.label, categories: o.categories, merchantTypes: o.merchantTypes };
}
