/**
 * GET /api/home — the Home tab parts no other endpoint has: safe to spend this week and
 * upcoming payments. No AI involved. Response: HomeExtrasResponse (lib/types.ts).
 * WHY reuse safeToSpend(): it's the coach's safe_to_spend tool, so Home and the chat
 * always show the same number. The rest of Home uses /api/account, /api/week, /api/insights.
 */
import { connection } from "next/server";
import type { HomeExtrasResponse } from "@/lib/types";
import { withPickedCustomer } from "@/lib/data/request";
import { safeToSpend } from "@/lib/insights/safeToSpend";
import { upcomingPayments } from "@/lib/insights/recurring";

export async function GET() {
  await connection(); // compute on every request, not at build time
  try {
    const body = await withPickedCustomer((): HomeExtrasResponse => {
      // WHY drop `rows`: that's the chart table for the chat; Home has its own layout.
      const full = safeToSpend(7);
      if (!full) return { safeToSpend: null, upcoming: upcomingPayments() };
      const { rows: _rows, ...summary } = full;
      void _rows;
      return { safeToSpend: summary, upcoming: upcomingPayments() };
    });
    return Response.json(body);
  } catch (err) {
    console.error("[api/home]", err);
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Could not load the Home tab.", detail }, { status: 500 });
  }
}
