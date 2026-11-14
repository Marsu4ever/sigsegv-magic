/**
 * GET /api/spending?month=YYYY-MM — the Spending breakdown on Home: the month's spending in
 * the 3 baskets (with categories, merchant types and purchases), money in, and the same days
 * of the month before. Default: the latest month. No AI involved.
 * Response: SpendingBreakdown (lib/types.ts), from lib/insights/spendingBreakdown.ts.
 */
import { connection } from "next/server";
import { withPickedCustomer } from "@/lib/data/request";
import { spendingBreakdown } from "@/lib/insights/spendingBreakdown";

export async function GET(request: Request) {
  await connection(); // compute on every request, not at build time
  const month = new URL(request.url).searchParams.get("month") ?? undefined;
  try {
    return Response.json(await withPickedCustomer(() => spendingBreakdown(month)));
  } catch (err) {
    console.error("[api/spending]", err);
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Could not load the spending breakdown.", detail }, { status: 500 });
  }
}
