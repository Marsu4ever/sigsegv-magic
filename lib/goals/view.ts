/**
 * The one response shape for the goal UI and the AI: GoalView (lib/types.ts). SERVER ONLY.
 * Everything on the goal card, the mission card and the Account strip comes from here.
 */
import type { GoalImpact, GoalView } from "@/lib/types";
import { getDataToday } from "@/lib/data";
import { daysCloser, goalProgress, simToday, weekRange } from "./goal";
import { missionCandidates, missionProgress, weeksWon } from "./missions";
import { getGoalState, type GoalState } from "./state";

export function goalView(state: GoalState = getGoalState()): GoalView {
  const won = weeksWon(state);
  // Candidates only when there's something to pick: a goal, no mission and no unread result.
  const picking = !!state.goal && !state.week.mission && !state.result;
  const { candidates, skippedForJoy } = picking ? missionCandidates(state) : { candidates: [], skippedForJoy: [] };
  return {
    asOf: getDataToday(),
    goal: goalProgress(state),
    level: 1 + won,
    weeksWon: won,
    week: { n: state.week.n, range: weekRange(state.week.n), day: state.week.day, today: simToday(state) },
    mission: missionProgress(state),
    candidates,
    skippedForJoy,
    result: state.result,
    joy: state.joy,
  };
}

/** A saving in days closer to the current goal (what-if view), or undefined without a goal. */
export function goalImpact(savingEur: number): GoalImpact | undefined {
  const state = getGoalState();
  const days = daysCloser(savingEur, state);
  return state.goal && days !== null && days > 0
    ? { goalName: state.goal.name, emoji: state.goal.emoji, daysCloser: days }
    : undefined;
}
