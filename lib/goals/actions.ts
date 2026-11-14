/**
 * Everything the user can do with a goal, as one small reducer: (state, action) → new state.
 * SERVER ONLY. Used by POST /api/goal, which then saves the state in the cookie.
 *
 * WHY a reducer: every change goes through one checked place, and it's easy to read what
 * each button does. The demo actions (addPurchase / nextDay / endWeek) stand in for real
 * card payments and real days passing — the data is a fixed snapshot (DECISIONS.md #60b).
 */
import type { GoalDraft } from "@/lib/types";
import { round2 } from "@/lib/data";
import { goalFromDraft, planGoal, simToday } from "./goal";
import { missionCandidates, missionForHabit, resolveWeek } from "./missions";
import { emptyGoalState, MAX_PURCHASES, type GoalState } from "./state";

export type GoalAction =
  | { action: "preview" | "create"; name?: unknown; amountEur?: unknown; byDate?: unknown; startEur?: unknown; emoji?: unknown }
  | { action: "pickMission"; id?: unknown; habit?: unknown }
  | { action: "addPurchase" | "deposit"; eur?: unknown }
  | { action: "nextDay" | "endWeek" | "moveToGoal" | "skipMove" | "nextWeek" | "reset" }
  | { action: "setJoy"; habit?: unknown; on?: unknown };

export type ActionResult = { state: GoalState; draft?: GoalDraft; error?: string; changed: boolean };

const fail = (state: GoalState, error: string): ActionResult => ({ state, error, changed: false });
const ok = (state: GoalState): ActionResult => ({ state, changed: true });

export function applyGoalAction(state: GoalState, a: GoalAction): ActionResult {
  switch (a.action) {
    case "preview":
      return { state, draft: planGoal(a, state), changed: false };

    case "create": {
      const draft = planGoal(a, state);
      if (draft.error) return { ...fail(state, draft.error), draft };
      // WHY keep history and level: a new goal is not a reason to lose what was earned.
      return { ...ok({ ...state, goal: goalFromDraft(draft, simToday(state)), movedEur: 0 }), draft };
    }

    case "pickMission": {
      if (!state.goal) return fail(state, "Set a goal first.");
      if (state.week.mission || state.result) return fail(state, "This week already has a mission.");
      const m =
        typeof a.habit === "string"
          ? missionForHabit(state, a.habit)
          : missionCandidates(state).candidates.find((c) => c.id === a.id);
      if (!m) return fail(state, "That one happens too rarely for a weekly mission.");
      return ok({ ...state, week: { ...state.week, mission: m, purchases: [] } });
    }

    case "addPurchase": {
      const eur = round2(Number(a.eur));
      if (!state.week.mission || state.result) return fail(state, "No mission running.");
      if (!Number.isFinite(eur) || eur <= 0 || eur > 1000) return fail(state, "Amount must be 0–1000 €.");
      if (state.week.purchases.length >= MAX_PURCHASES) return fail(state, "That's enough purchases for one week.");
      const purchases = [...state.week.purchases, { date: simToday(state), eur }];
      return ok({ ...state, week: { ...state.week, purchases } });
    }

    case "deposit": {
      // The user moves their own money to the goal (any time, any amount) — the honest way
      // to fill the bar besides a mission's "put it toward the goal".
      const eur = round2(Number(a.eur));
      if (!state.goal) return fail(state, "Set a goal first.");
      if (!Number.isFinite(eur) || eur <= 0 || eur > 100_000) return fail(state, "Enter an amount above 0 €.");
      return ok({ ...state, movedEur: round2(state.movedEur + eur) });
    }

    case "nextDay":
      if (!state.week.mission || state.result) return fail(state, "No mission running.");
      // Day 7 → the week is over.
      return ok(state.week.day >= 7 ? resolveWeek(state) : { ...state, week: { ...state.week, day: state.week.day + 1 } });

    case "endWeek":
      if (!state.week.mission || state.result) return fail(state, "No mission running.");
      return ok(resolveWeek(state));

    case "moveToGoal":
    case "skipMove": {
      const r = state.result;
      if (!r || r.movedEur !== null) return fail(state, "Nothing to move.");
      const moved = a.action === "moveToGoal" && state.goal ? r.keptEur : 0;
      const result = { ...r, movedEur: moved };
      return ok({
        ...state,
        movedEur: round2(state.movedEur + moved),
        result,
        history: state.history.map((h) => (h.n === r.n ? result : h)),
      });
    }

    case "nextWeek":
      if (!state.result) return fail(state, "This week isn't over yet.");
      return ok({
        ...state,
        result: null,
        week: { n: state.week.n + 1, day: 1, mission: null, purchases: [] },
      });

    case "setJoy": {
      if (typeof a.habit !== "string" || !a.habit.trim()) return fail(state, "Which habit?");
      const habit = a.habit.trim().slice(0, 40);
      const rest = state.joy.filter((j) => j.toLowerCase() !== habit.toLowerCase());
      return ok({ ...state, joy: a.on ? [...rest, habit].slice(-20) : rest });
    }

    case "reset": {
      // WHY keep weeks won, difficulty and joy: XP never goes down (DECISIONS.md #60).
      const fresh = emptyGoalState();
      return ok({ ...fresh, history: state.history, cutPct: state.cutPct, joy: state.joy, week: state.week, result: state.result });
    }

    default:
      return fail(state, "Unknown action.");
  }
}
