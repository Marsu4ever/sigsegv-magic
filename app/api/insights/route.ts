/**
 * GET /api/insights — what the coach noticed without being asked (lib/insights/proactive.ts):
 * help to save, spending alerts, unusual activity, recurring payments. No AI involved.
 * Response: InsightsResponse (see lib/types.ts).
 * WHY computed on every request: "proactive" = fresh every time the app is opened.
 */
import { connection } from "next/server";
import type { InsightsResponse } from "@/lib/types";
import { getDataToday } from "@/lib/data";
import { withPickedCustomer } from "@/lib/data/request";
import { proactiveInsights } from "@/lib/insights/proactive";

export async function GET() {
  await connection();
  try {
    const body: InsightsResponse = await withPickedCustomer(() => ({
      asOf: getDataToday(),
      insights: proactiveInsights(),
    }));
    return Response.json(body);
  } catch (err) {
    console.error("[api/insights]", err);
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Could not load insights.", detail }, { status: 500 });
  }
}
