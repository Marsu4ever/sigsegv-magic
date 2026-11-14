/**
 * GET  /api/goal → GoalView (lib/types.ts): the saving goal, this week's mission, level.
 * POST /api/goal { action, … } → applies one action (lib/goals/actions.ts), saves the state in
 *      the "goal_<customer>" cookie and returns { view: GoalView, draft?, error? }.
 *      "preview" only works out a draft (weekly amount, realistic?) and saves nothing.
 * No AI involved. See DECISIONS.md #53.
 */
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getCustomerId } from "@/lib/data";
import { pickedGoalState, withPickedCustomer } from "@/lib/data/request";
import { applyGoalAction, type GoalAction } from "@/lib/goals/actions";
import { goalCookieName, serializeGoalState } from "@/lib/goals/state";
import { goalView } from "@/lib/goals/view";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, like the demo customer cookie

export async function GET() {
  await connection();
  try {
    return Response.json(await withPickedCustomer(() => goalView()));
  } catch (err) {
    console.error("[api/goal] GET failed:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Could not load your goal.", detail }, { status: 500 });
  }
}

export async function POST(req: Request) {
  await connection();
  let body: GoalAction;
  try {
    body = (await req.json()) as GoalAction;
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  try {
    const before = await pickedGoalState();
    // WHY inside withPickedCustomer: missions and the weekly plan read this customer's data.
    const out = await withPickedCustomer(() => {
      const r = applyGoalAction(before, body);
      return { ...r, view: goalView(r.state), customer: getCustomerId() };
    }, before);
    console.log(
      `[api/goal] ${body.action} customer=${out.customer}` + (out.error ? ` ✗ ${out.error}` : out.changed ? " ✓ saved" : ""),
    );
    if (out.changed) {
      (await cookies()).set(goalCookieName(out.customer), serializeGoalState(out.state), {
        path: "/",
        maxAge: COOKIE_MAX_AGE,
        sameSite: "lax",
      });
    }
    return Response.json(
      { view: out.view, ...(out.draft ? { draft: out.draft } : {}), ...(out.error ? { error: out.error } : {}) },
      { status: out.error && body.action !== "preview" ? 400 : 200 },
    );
  } catch (err) {
    console.error("[api/goal] POST failed:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Could not update your goal.", detail }, { status: 500 });
  }
}
