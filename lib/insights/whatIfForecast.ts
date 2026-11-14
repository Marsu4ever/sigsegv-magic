/**
 * "What if I spent X% less on <target>?" — the what-if view (chart + toggle).
 * Owner: INSIGHTS. SERVER ONLY.
 *
 * The ONLY place the what-if view's numbers are calculated — used by the AI tool
 * what_if_spending and by GET /api/what-if (toggle + buttons, no AI).
 * Rules: PLAN-what-if-forecast.md §3 and DECISIONS.md #24–#25.
 *
 * PREDICTION: "the next N months look like the last N months" (N = 1, 3 or 6), for the
 * target only. Short history → the longest covered period (3 or 1 months), scaled up.
 * DEFAULT TARGET: the customer's biggest everyday-basket group (getDefaultTarget) — the chip
 * "What if I spent less on X?" and the AI's fallback when X is unclear (DECISIONS.md #27).
 *
 * WHY a separate file from whatIf.ts: whatIf.ts is the older "average per month × %"
 * tool (what_if). It stays as it is, as a sub-tool that can become an extra section
 * of the what-if view later.
 */
import type {
  ChartRow,
  CutSaving,
  DateRange,
  ForecastMonths,
  ProjectionPoint,
  SpendingTarget,
  TargetPurchase,
  Transaction,
  WhatIf,
} from "@/lib/types";
import { CUT_OPTIONS, FORECAST_MONTHS } from "@/lib/types";
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

export const DEFAULT_CUT_PCT = CUT_OPTIONS[0]; // 5 %
const TOP_CATEGORIES = 2; // WHY 2: fewer buttons keep the phone view calm

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
  // WHY scale by months, not days: "same as last month" must show the same € as last month.
  const noChangeEur = round2((past * months) / basedOn);
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
    cutOptions: CUT_OPTIONS.map((c) => cutTotals(noChangeEur, c)),
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
    breakdown,
    topCategories,
  };
}

/**
 * §3.5 — running-total chart points.
 * Past: 0 € at the start, then the running total every `step` days (counted back from today).
 * Today: all three lines meet at pastEur.
 * Future: replays the past days' rhythm, scaled so it ends at pastEur + noChangeEur.
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

  const raw = Array.from({ length: p.futureDays }, (_, j) => p.daily[j % n]);
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
  const hasData = (r: WhatIf) => r.status !== "not_enough_data" && r.pastEur > 0;
  // WHY check every period: the coach can then say "switch to 3 months" only when that is true.
  // Cheap: three passes over one customer's ~1000 transactions.
  const monthsWithData = FORECAST_MONTHS.filter((m) =>
    hasData(calculate(txs, today, firstDay, target, m, cutPct)),
  );
  let r = calculate(txs, today, firstDay, target, months, cutPct);
  if (r.status !== "not_enough_data" && r.pastEur === 0) {
    // WHY: an all-zero chart says nothing — show the 🙂 "Not enough data yet" state instead.
    r = {
      ...r,
      status: "not_enough_data",
      emptyReason: "no_spending",
      points: [],
      cutOptions: [],
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
  return buildWhatIf(getTransactions(), getDataToday(), getDataFirstDay(), target, months, cutPct);
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
 * One of CUT_OPTIONS (5 / 10 / 20); anything else → DEFAULT_CUT_PCT.
 * WHY only these: the view has one circle per option, so another % couldn't be shown as selected.
 */
export function parseCutPct(v: unknown): number {
  const n = Number(v);
  return CUT_OPTIONS.includes(n) ? n : DEFAULT_CUT_PCT;
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
