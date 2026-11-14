/**
 * Savings goal math: the weekly amount needed, "is this realistic?", progress and the plan line.
 * SERVER ONLY. Owner: INSIGHTS person. All numbers about a goal come from here (team rule).
 *
 * TIME: the data is a fixed snapshot ending on getDataToday() (DECISIONS.md #10). Mission
 * week N is the 7 days after the data ends, + 7 days per later week (DECISIONS.md #60b). The
 * app's "today" for goals = the current day of the current mission week (simToday).
 */
import type { DateRange, GoalDraft, SavingsGoal } from "@/lib/types";
import { addDays, addMonths, daysInRange, getDataToday, round2 } from "@/lib/data";
import { incomeSummary } from "@/lib/data/money";
import type { GoalState } from "./state";

export const MIN_GOAL_EUR = 10;
export const MAX_GOAL_EUR = 100_000;
const MAX_YEARS = 5;
/**
 * WHY half: a goal that needs everything the user usually keeps leaves no room for surprises
 * (the "irregular" basket). Half is a simple, explainable line for "comfortable".
 */
const COMFORTABLE_SHARE = 0.5;

/** The 7 days of mission week n. */
export function weekRange(n: number): DateRange {
  const from = addDays(getDataToday(), 7 * (n - 1) + 1);
  return { from, to: addDays(from, 6) };
}

/** The app's "today" for goals: day `week.day` of the current mission week. */
export function simToday(state: GoalState): string {
  return addDays(weekRange(state.week.n).from, state.week.day - 1);
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** A quiet emoji from the goal's name (the user can change it). */
export function guessEmoji(name: string): string {
  const n = name.toLowerCase();
  const rules: [RegExp, string][] = [
    [/trip|travel|holiday|vacation|flight|lisbon|paris|rome|beach|matka|loma/, "✈️"],
    [/phone|iphone|laptop|computer|tablet|console|puhelin/, "📱"],
    [/school|course|study|studies|university|exam/, "🎓"],
    [/home|flat|apartment|deposit|house|asunto|koti/, "🏠"],
    [/gift|christmas|birthday|wedding|lahja|joulu/, "🎁"],
    [/buffer|emergency|rainy|safety|puskuri/, "🛟"],
    [/car|bike|scooter|auto/, "🚲"],
  ];
  return rules.find(([re]) => re.test(n))?.[1] ?? "🎯";
}

/**
 * What the user usually keeps a week: income − spending over the last 3 FULL months.
 * WHY full months: the current month is cut short, so it would look like less spending.
 */
export function typicalKeptPerWeek(): number | null {
  const thisMonthStart = getDataToday().slice(0, 8) + "01";
  const range = { from: addMonths(thisMonthStart, -3), to: addDays(thisMonthStart, -1) };
  const s = incomeSummary(range);
  if (s.incomeEur <= 0) return null;
  return round2((s.keptEur / daysInRange(range)) * 7);
}

/** Accept "YYYY-MM-DD" or "YYYY-MM" (→ last day of that month). */
function parseDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))) return s;
  if (/^\d{4}-\d{2}$/.test(s)) return addDays(addMonths(`${s}-01`, 1), -1);
  return null;
}

/** Check and work out a goal. Never throws: problems come back as `error`. */
export function planGoal(
  input: { name?: unknown; amountEur?: unknown; byDate?: unknown; startEur?: unknown; emoji?: unknown },
  state: GoalState,
): GoalDraft {
  const today = simToday(state);
  const name = (typeof input.name === "string" && input.name.trim() ? input.name.trim() : "My goal").slice(0, 30);
  const emoji =
    typeof input.emoji === "string" && input.emoji.trim() ? input.emoji.trim().slice(0, 4) : guessEmoji(name);
  const targetEur = round2(Number(input.amountEur));
  const startEur = Math.max(0, round2(Number(input.startEur) || 0));
  const byDate = parseDate(input.byDate) ?? "";
  const base: GoalDraft = {
    name,
    emoji,
    targetEur: Number.isFinite(targetEur) ? targetEur : 0,
    startEur,
    byDate,
    weeksLeft: 0,
    weeklyNeededEur: 0,
    typicalKeptPerWeekEur: null,
    stretch: false,
    suggestedDate: null,
  };

  if (!Number.isFinite(targetEur) || targetEur < MIN_GOAL_EUR || targetEur > MAX_GOAL_EUR)
    return { ...base, error: `The amount should be between ${MIN_GOAL_EUR} € and ${MAX_GOAL_EUR} €.` };
  if (startEur >= targetEur) return { ...base, error: "You already have that much set aside." };
  if (!byDate) return { ...base, error: "Pick a date for the goal." };
  const days = daysBetween(today, byDate);
  if (days < 7) return { ...base, error: `Pick a date at least a week after ${today}.` };
  if (days > 365 * MAX_YEARS) return { ...base, error: `Pick a date within ${MAX_YEARS} years.` };

  const weeksLeft = Math.max(1, Math.floor(days / 7));
  const need = targetEur - startEur;
  const weeklyNeededEur = round2(need / weeksLeft);
  const kept = typicalKeptPerWeek();
  const comfortable = kept !== null ? kept * COMFORTABLE_SHARE : null;
  const stretch = comfortable !== null && weeklyNeededEur > comfortable;
  let suggestedDate: string | null = null;
  if (stretch && comfortable !== null && comfortable > 0) {
    const d = addDays(today, Math.ceil(need / comfortable) * 7);
    suggestedDate = daysBetween(today, d) <= 365 * MAX_YEARS ? d : null;
  }
  return { ...base, weeksLeft, weeklyNeededEur, typicalKeptPerWeekEur: kept, stretch, suggestedDate };
}

/** A checked draft → the goal to store. */
export function goalFromDraft(d: GoalDraft, today: string): SavingsGoal {
  return {
    name: d.name,
    emoji: d.emoji,
    targetEur: d.targetEur,
    startEur: d.startEur,
    byDate: d.byDate,
    createdOn: today,
    weeklyPlanEur: d.weeklyNeededEur,
  };
}

/** Where the goal stands now. */
export function goalProgress(state: GoalState) {
  const g = state.goal;
  if (!g) return null;
  const today = simToday(state);
  const savedEur = round2(g.startEur + state.movedEur);
  const remainingEur = round2(Math.max(0, g.targetEur - savedEur));
  const weeksLeft = Math.max(1, Math.ceil(daysBetween(today, g.byDate) / 7));
  // The plan line: startEur + the weekly plan for every full week since the goal was made.
  const elapsedWeeks = Math.max(0, Math.floor(daysBetween(g.createdOn, today) / 7));
  const planned = g.startEur + g.weeklyPlanEur * elapsedWeeks;
  // WHY never negative: "behind plan" is guilt, not help. weeklyNeededEur already says
  // what it takes from here (DECISIONS.md #60: no loss framing).
  const daysAhead =
    g.weeklyPlanEur > 0 ? Math.max(0, Math.floor(((savedEur - planned) / g.weeklyPlanEur) * 7)) : 0;
  return {
    ...g,
    savedEur,
    pct: round2(Math.min(100, (savedEur / g.targetEur) * 100)),
    remainingEur,
    weeksLeft,
    weeklyNeededEur: round2(remainingEur / weeksLeft),
    daysAhead,
    reached: savedEur >= g.targetEur,
  };
}

/** A saving of `eur` in days of the goal's weekly plan (null = no goal). One decimal. */
export function daysCloser(eur: number, state: GoalState): number | null {
  const w = state.goal?.weeklyPlanEur;
  return w && w > 0 ? Math.round((eur / w) * 7 * 10) / 10 : null;
}
