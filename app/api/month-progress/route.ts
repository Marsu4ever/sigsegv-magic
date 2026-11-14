/**
 * GET /api/month-progress?month=YYYY-MM — the "month so far" chart for any month.
 * Used by the ‹ › arrows in the full-screen chart. Response: the ChartSpec parts
 * that change per month (rows, facts, items, seriesNames, monthNav).
 */
import { connection } from "next/server";
import type { ChartSpec } from "@/lib/types";
import { monthProgress } from "@/lib/insights/monthProgress";
import { withPickedCustomer } from "@/lib/data/request";

export async function GET(request: Request) {
  await connection();
  const month = new URL(request.url).searchParams.get("month") ?? undefined;
  try {
    // WHY wrapped: show the customer picked in the app's DEMO bar (lib/data/request.ts).
    const m = await withPickedCustomer(() => monthProgress(month));
    const body: Partial<ChartSpec> = {
      rows: m.rows,
      facts: m.facts,
      items: m.biggestExpenses,
      seriesNames: m.seriesNames,
      monthNav: m.monthNav,
    };
    return Response.json(body);
  } catch (e) {
    console.error("[api/month-progress]", e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
