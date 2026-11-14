/**
 * GET /api/glance — one friendly number for the chat's start screen:
 * money kept (income − spending) and money spent so far this month. No AI involved.
 */
import { connection } from "next/server";
import { periodToRange } from "@/lib/data";
import { incomeSummary } from "@/lib/data/money";
import { withPickedCustomer } from "@/lib/data/request";

export async function GET() {
  await connection();
  try {
    const body = await withPickedCustomer(() => {
      const s = incomeSummary(periodToRange("this_month"));
      return { keptEur: s.keptEur, spentEur: s.spendingEur };
    });
    return Response.json(body);
  } catch (err) {
    console.error("[api/glance]", err);
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Could not load the glance.", detail }, { status: 500 });
  }
}
