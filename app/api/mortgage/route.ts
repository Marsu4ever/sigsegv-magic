/**
 * GET /api/mortgage — the current customer's home loan application for the
 * Home loan tab. No AI involved.
 * Response: { mortgage: MortgageSummary | null } (see lib/types.ts).
 */
import { connection } from "next/server";
import { getMortgageSummary } from "@/lib/data/mortgage";
import { withPickedCustomer } from "@/lib/data/request";

export async function GET() {
  // WHY connection(): compute on every request, not once at build time.
  await connection();
  try {
    return Response.json({ mortgage: await withPickedCustomer(getMortgageSummary) });
  } catch (err) {
    console.error("[api/mortgage]", err);
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Could not load the home loan data.", detail }, { status: 500 });
  }
}
