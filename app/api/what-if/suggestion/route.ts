/**
 * GET /api/what-if/suggestion — the landing chip "What if I spent less on X?".
 * Response: { target: SpendingTarget }. X = the customer's biggest
 * everyday-basket group (getDefaultTarget in lib/insights/whatIfForecast.ts).
 * WHY an endpoint: ChatView is a client component and must not import server-only lib/insights.
 */
import { connection } from "next/server";
import { getDefaultTarget } from "@/lib/insights/whatIfForecast";
import { withPickedCustomer } from "@/lib/data/request";

export async function GET() {
  await connection(); // WHY: compute per request, not frozen at build time (same as /api/what-if)
  try {
    // WHY withPickedCustomer: X must be the top category of the customer picked in the app.
    const target = await withPickedCustomer(getDefaultTarget);
    console.log(`[api/what-if/suggestion] ${target.label}`);
    return Response.json({ target });
  } catch (err) {
    console.error("[api/what-if/suggestion]", err);
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: "Could not pick a what-if suggestion.", detail },
      { status: 500 },
    );
  }
}
