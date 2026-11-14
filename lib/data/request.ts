/**
 * Server side of the in-app customer picker (client side: lib/demoCustomer.ts). SERVER ONLY.
 *
 * Every API route and team page that shows customer data wraps its work like this:
 *   return Response.json(await withPickedCustomer(() => getWeekSummary()));
 * so all data functions inside use the customer picked in the app.
 *
 * It also loads that customer's saving goal (cookie "goal_<id>", lib/goals/state.ts), so
 * getGoalState() works inside data functions and AI tools too.
 */
import { cookies } from "next/headers";
import { DEMO_CUSTOMER_COOKIE } from "@/lib/demoCustomer";
import { goalCookieName, parseGoalCookie, withGoalState, type GoalState } from "@/lib/goals/state";
import { getDefaultCustomerId, listDemoCustomerIds, withCustomer } from "./load";

/** The customer picked in the app, or undefined (= use the default). Unknown ids are ignored. */
export async function pickedCustomerId(): Promise<string | undefined> {
  const id = (await cookies()).get(DEMO_CUSTOMER_COOKIE)?.value;
  return id && listDemoCustomerIds().includes(id) ? id : undefined;
}

/** The saving goal state of the customer shown in the app (empty if none / unreadable). */
export async function pickedGoalState(): Promise<GoalState> {
  const id = (await pickedCustomerId()) ?? getDefaultCustomerId();
  return parseGoalCookie((await cookies()).get(goalCookieName(id))?.value);
}

/** Run `fn` (sync or async) with the customer picked in the app (and their goal state). */
export async function withPickedCustomer<T>(fn: () => T, goal?: GoalState): Promise<Awaited<T>> {
  const state = goal ?? (await pickedGoalState());
  return await withCustomer(await pickedCustomerId(), () => withGoalState(state, fn));
}
