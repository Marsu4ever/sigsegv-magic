/**
 * GET /api/account?offset=N — the Account tab: balance, this month in/out, balance
 * history and one page of transactions (newest first). No AI involved.
 * Response: AccountSummary (see lib/types.ts).
 */
import { connection } from "next/server";
import { getAccountSummary } from "@/lib/data/home";
import { withPickedCustomer } from "@/lib/data/request";

export async function GET(request: Request) {
  // WHY connection(): compute on every request, not once at build time.
  await connection();
  const offset = Number(new URL(request.url).searchParams.get("offset")) || 0;
  try {
    return Response.json(await withPickedCustomer(() => getAccountSummary(offset)));
  } catch (err) {
    console.error("[api/account]", err);
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Could not load the account.", detail }, { status: 500 });
  }
}
