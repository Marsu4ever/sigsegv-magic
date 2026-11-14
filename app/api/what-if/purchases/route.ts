/**
 * GET /api/what-if/purchases — the purchases behind a tapped point on the what-if chart.
 * No AI involved. Response: TargetPurchase[] (newest first).
 * Params: target=<JSON SpendingTarget> (as /api/what-if), from=YYYY-MM-DD, to=YYYY-MM-DD.
 */
import { connection } from "next/server";
import { getTargetPurchases, parseTarget } from "@/lib/insights/whatIfForecast";
import { withPickedCustomer } from "@/lib/data/request";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  await connection(); // WHY: compute per request, not frozen at build time
  const q = new URL(request.url).searchParams;
  const target = parseTarget(q.get("target"));
  const from = q.get("from") ?? "";
  const to = q.get("to") ?? "";
  if (!target) return Response.json({ error: "Unknown or invalid target" }, { status: 400 });
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) {
    return Response.json({ error: "from and to must be YYYY-MM-DD, from ≤ to" }, { status: 400 });
  }
  try {
    // WHY withPickedCustomer: the same customer as the chat (the one picked in the app).
    const list = await withPickedCustomer(() => getTargetPurchases(target, { from, to }));
    console.log(`[api/what-if/purchases] ${target.label} ${from}…${to} → ${list.length}`);
    return Response.json(list);
  } catch (err) {
    console.error("[api/what-if/purchases]", err);
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Could not load the purchases.", detail }, { status: 500 });
  }
}
