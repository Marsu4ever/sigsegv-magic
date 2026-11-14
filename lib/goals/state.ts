/**
 * Saving goal state: what the user set up, stored in a cookie. SERVER ONLY. Owner: INSIGHTS person.
 *
 * WHY a cookie (same idea as the demo customer, lib/demoCustomer.ts): the server is stateless
 * (DECISIONS.md #17), the browser sends the cookie with every request, so the This week page, the
 * Home strip, the what-if view and the AI tools all see the same goal. One cookie per demo
 * customer ("goal_CUST00313"), so switching customers keeps each person's goal.
 *
 * Only POST /api/goal writes it. Anything that doesn't parse → a fresh, empty state (never crash).
 *
 * WHY AsyncLocalStorage: the AI tools are synchronous and can't read cookies. withPickedCustomer()
 * (lib/data/request.ts) reads the cookie once per request and runs the work inside withGoalState(),
 * so getGoalState() works anywhere — the same trick as getCustomerId() in lib/data/load.ts.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { Mission, MissionPurchase, SavingsGoal, WeekResult } from "@/lib/types";

export type GoalState = {
  v: 1;
  goal: SavingsGoal | null;
  movedEur: number; // money the user moved to the goal (goal.startEur not included)
  week: {
    n: number; // mission week 1, 2, 3… (week 1 = the 7 days after the data ends)
    day: number; // 1–7: the current day of that week (demo: "Next day" moves it)
    mission: Mission | null;
    purchases: MissionPurchase[]; // demo purchases on the mission's habit this week
  };
  result: WeekResult | null; // the week that just ended, shown until "next week"
  history: WeekResult[]; // finished weeks, oldest first
  cutPct: number; // how much below the usual week missions aim (10–30, starts at 20)
  joy: string[]; // habits the user marked "Sparks joy" (never turned into missions)
};

export const CUT_START = 20;
export const CUT_MIN = 10;
export const CUT_MAX = 30;
export const MAX_PURCHASES = 30; // keeps the cookie far below the 4 KB limit
const MAX_HISTORY = 26;

export function emptyGoalState(): GoalState {
  return {
    v: 1,
    goal: null,
    movedEur: 0,
    week: { n: 1, day: 1, mission: null, purchases: [] },
    result: null,
    history: [],
    cutPct: CUT_START,
    joy: [],
  };
}

export function goalCookieName(customerId: string): string {
  return `goal_${customerId.replace(/[^A-Za-z0-9_-]/g, "")}`;
}

/** Cookie value → state. WHY base64url: JSON has characters cookies don't allow. */
export function parseGoalCookie(value: string | undefined): GoalState {
  if (!value) return emptyGoalState();
  try {
    const s = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<GoalState>;
    if (s?.v !== 1 || typeof s.week?.n !== "number") return emptyGoalState();
    const base = emptyGoalState();
    return {
      ...base,
      ...s,
      week: { ...base.week, ...s.week, purchases: (s.week.purchases ?? []).slice(-MAX_PURCHASES) },
      history: (s.history ?? []).slice(-MAX_HISTORY),
      joy: Array.isArray(s.joy) ? s.joy.filter((j) => typeof j === "string").slice(0, 20) : [],
    } as GoalState;
  } catch {
    return emptyGoalState();
  }
}

export function serializeGoalState(s: GoalState): string {
  const trimmed = { ...s, history: s.history.slice(-MAX_HISTORY) };
  return Buffer.from(JSON.stringify(trimmed), "utf8").toString("base64url");
}

const store = new AsyncLocalStorage<GoalState>();

/** Run `fn` with `state` as the current request's goal state. */
export function withGoalState<T>(state: GoalState, fn: () => T): T {
  return store.run(state, fn);
}

/** The goal state of the current request (empty outside a request, e.g. scripts). */
export function getGoalState(): GoalState {
  return store.getStore() ?? emptyGoalState();
}
