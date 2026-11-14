/**
 * GET /api/transactions — search the selected customer's transactions (Activity page, Home's
 * recent list). Query: month (YYYY-MM | latest) or from / to (YYYY-MM-DD), q, category,
 * type (all | income | expense),
 * sort (newest | oldest), offset, limit. No AI involved.
 * Response: TransactionSearch (lib/types.ts), from lib/data/home.ts → searchTransactions.
 */
import { connection } from "next/server";
import { searchTransactions } from "@/lib/data/home";
import { withPickedCustomer } from "@/lib/data/request";

export async function GET(request: Request) {
  await connection(); // compute on every request, not at build time
  const p = new URL(request.url).searchParams;
  const num = (k: string) => (p.get(k) ? Number(p.get(k)) : undefined);
  try {
    const body = await withPickedCustomer(() =>
      searchTransactions({
        month: p.get("month") ?? undefined,
        q: p.get("q") ?? undefined,
        category: p.get("category") ?? undefined,
        type: p.get("type") ?? undefined,
        from: p.get("from") ?? undefined,
        to: p.get("to") ?? undefined,
        sort: p.get("sort") ?? undefined,
        offset: num("offset"),
        limit: num("limit"),
      }),
    );
    return Response.json(body);
  } catch (err) {
    console.error("[api/transactions]", err);
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Could not load transactions.", detail }, { status: 500 });
  }
}
