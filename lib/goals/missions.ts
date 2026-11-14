/**
 * Weekly missions: "spend at most X € on one habit this week". SERVER ONLY. Owner: INSIGHTS person.
 *
 * WHY code builds the missions, not the AI (DECISIONS.md #53): a mission holds a baseline, a cap
 * and a saving — exactly the numbers the AI has invented before (#45–#47). The habits come from
 * everyday_leaks (lib/insights/leaks.ts), the same habit cards the user sees in the Leaks chart.
 *
 * RULES (tunable here):
 * - habits from the last 90 days that cost ≥ 8 € a week, and whose cap still leaves room for at
 *   least one usual purchase (WHY: with ~1 purchase a week, "20 % less" would mean "skip it
 *   entirely" — a ban, not a nudge)
 * - habits the user marked "Sparks joy ✨" are left out (you don't cut what you love)
 * - usual week = the habit's yearly cost / 52; cap = usual × (1 − cutPct %), rounded down
 * - cutPct starts at 20 %, +5 after a won week, −5 after a missed one (10–30 %), so missions
 *   stay winnable ("winnable first" → competence keeps people going)
 * - fewer than 3 habits qualify → add one "everyday spending" mission, so there is always a choice
 */
import type { Mission, MissionStatus, WeekResult } from "@/lib/types";
import { getTransactions, isSpending, periodToRange, round2, spentEur } from "@/lib/data";
import { everydayLeaks, habitName } from "@/lib/insights/leaks";
import { daysCloser } from "./goal";
import { CUT_MAX, CUT_MIN, type GoalState } from "./state";

const MIN_WEEKLY_EUR = 8;
const MAX_CANDIDATES = 3;
const STEP_PCT = 5;
/** Show "Fridays are your big X day" only when that day really stands out. */
const DAY_HINT_SHARE = 0.3;
/** "Close" = 80 % of the cap used. */
const CLOSE_SHARE = 0.8;

const DAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

/** The weekday that holds the most of this habit's euros, if it stands out. */
function dayHint(habit: string | null, label: string): string | null {
  const byDay = new Array(7).fill(0);
  let total = 0;
  for (const t of getTransactions(periodToRange("last_90_days"))) {
    if (!isSpending(t) || t.basket !== "everyday") continue;
    if (habit && habitName(t) !== habit) continue;
    const eur = spentEur(t);
    byDay[new Date(t.date.slice(0, 10) + "T00:00:00Z").getUTCDay()] += eur;
    total += eur;
  }
  if (total <= 0) return null;
  const best = byDay.indexOf(Math.max(...byDay));
  if (byDay[best] / total < DAY_HINT_SHARE) return null;
  return habit ? `${DAYS[best]} are your big ${label} day` : `${DAYS[best]} are usually your biggest day`;
}

function makeMission(
  m: { id: string; habit: string; category: string; weeklyEur: number; averageEur: number },
  state: GoalState,
): Mission {
  const baselineEur = Math.round(m.weeklyEur);
  let capEur = Math.floor(baselineEur * (1 - state.cutPct / 100));
  if (capEur >= baselineEur) capEur = baselineEur - 1;
  const keepsEur = baselineEur - capEur;
  const label = m.id === "everyday" ? "everyday spending" : m.habit;
  return {
    id: m.id,
    habit: m.habit,
    category: m.category,
    title: m.id === "everyday" ? `Everyday spending under ${capEur} € this week` : `${m.habit} under ${capEur} € this week`,
    baselineEur,
    capEur,
    keepsEur,
    daysCloser: daysCloser(keepsEur, state),
    dayHint: dayHint(m.id === "everyday" ? null : m.habit, label),
    typicalPurchaseEur: Math.max(1, Math.round(m.averageEur)),
  };
}

/** Up to 3 missions for this week, biggest saving first, and the habits left out for joy. */
export function missionCandidates(state: GoalState): { candidates: Mission[]; skippedForJoy: string[] } {
  const leaks = everydayLeaks(periodToRange("last_90_days"));
  const joy = new Set(state.joy.map((j) => j.toLowerCase()));
  const skippedForJoy: string[] = [];
  const candidates: Mission[] = [];
  for (const h of leaks.view.habits) {
    const weeklyEur = h.perYearEur / 52;
    if (weeklyEur < MIN_WEEKLY_EUR) continue;
    const m = makeMission(
      { id: `habit:${h.name}`, habit: h.name, category: h.category, weeklyEur, averageEur: h.averageEur },
      state,
    );
    if (m.capEur < h.averageEur) continue; // no room for one usual purchase → a ban, skip
    if (joy.has(h.name.toLowerCase())) {
      skippedForJoy.push(h.name);
      continue;
    }
    candidates.push(m);
  }
  candidates.sort((a, b) => b.keepsEur - a.keepsEur);
  candidates.splice(MAX_CANDIDATES - 1);
  if (leaks.everydayPerYearEur / 52 >= MIN_WEEKLY_EUR) {
    const n = leaks.view.drops.length || 1;
    const total = leaks.view.drops.reduce((s, d) => s + d.amount, 0);
    candidates.push(
      makeMission(
        {
          id: "everyday",
          habit: "Everyday spending",
          category: "Lifestyle",
          weeklyEur: leaks.everydayPerYearEur / 52,
          averageEur: total / n,
        },
        state,
      ),
    );
  }
  return { candidates: candidates.slice(0, MAX_CANDIDATES), skippedForJoy };
}

/** The mission for a habit name (e.g. from a Leaks card), or null if it isn't one this week. */
export function missionForHabit(state: GoalState, habit: string): Mission | null {
  const id = `habit:${habit}`;
  return missionCandidates(state).candidates.find((m) => m.id === id || m.habit === habit) ?? null;
}

/** How this week's mission is going. */
export function missionProgress(state: GoalState) {
  const m = state.week.mission;
  if (!m) return null;
  const spentEur = round2(state.week.purchases.reduce((s, p) => s + p.eur, 0));
  const status: MissionStatus =
    spentEur > m.capEur ? "over" : spentEur >= m.capEur * CLOSE_SHARE ? "close" : "on_track";
  return {
    ...m,
    spentEur,
    leftEur: round2(Math.max(0, m.capEur - spentEur)),
    daysLeft: 8 - state.week.day, // today counts
    status,
    purchases: state.week.purchases,
  };
}

/** End the week: won or not, how much was kept, and next week's difficulty. */
export function resolveWeek(state: GoalState): GoalState {
  const p = missionProgress(state);
  if (!p || state.result) return state;
  const won = p.spentEur <= p.capEur;
  const result: WeekResult = {
    n: state.week.n,
    habit: p.habit,
    won,
    spentEur: p.spentEur,
    capEur: p.capEur,
    baselineEur: p.baselineEur,
    // WHY also after a missed week: spending less than usual still counts as real money kept.
    keptEur: round2(Math.max(0, p.baselineEur - p.spentEur)),
    movedEur: null,
  };
  return {
    ...state,
    result,
    history: [...state.history, result],
    cutPct: Math.min(CUT_MAX, Math.max(CUT_MIN, state.cutPct + (won ? STEP_PCT : -STEP_PCT))),
    week: { ...state.week, day: 7 },
  };
}

export function weeksWon(state: GoalState): number {
  return state.history.filter((h) => h.won).length;
}
