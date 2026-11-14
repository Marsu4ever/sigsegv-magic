/**
 * GET /api/week — this week's spending for the Week tab. No AI involved.
 * Response: WeekSummary (see lib/types.ts).
 */
import { connection } from "next/server";
import { getWeekSummary } from "@/lib/data";

export async function GET() {
  // WHY connection(): tells Next.js to compute this on every request instead
  // of freezing the result at build time, so data changes show up.
  await connection();
  try {
    return Response.json(getWeekSummary());
  } catch (err) {
    console.error("[api/week]", err);
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Could not load this week's data.", detail }, { status: 500 });
  }
}
