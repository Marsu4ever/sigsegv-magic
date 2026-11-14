/**
 * GET /api/day?date=YYYY-MM-DD — what was spent on one day.
 * Used when tapping a day in the spending heatmap. Response: DaySpending.
 */
import { connection } from "next/server";
import type { DaySpending } from "@/lib/types";
import { getTransactions, isIncome, isSpending, merchantType, round2, spentEur } from "@/lib/data";
import { withPickedCustomer } from "@/lib/data/request";

export async function GET(request: Request) {
  await connection();
  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  // WHY wrapped: show the customer picked in the app's DEMO bar (lib/data/request.ts).
  const txs = await withPickedCustomer(() => getTransactions({ from: date, to: date }));
  const spending = txs.filter(isSpending);
  const body: DaySpending = {
    date,
    totalEur: round2(spending.reduce((s, t) => s + spentEur(t), 0)),
    incomeEur: round2(txs.filter(isIncome).reduce((s, t) => s + t.amountEur, 0)),
    transactions: spending
      .map((t) => ({
        category: t.category,
        merchantType: merchantType(t.mccCode) ?? null,
        amountEur: round2(spentEur(t)),
        basket: t.basket,
      }))
      .sort((a, b) => b.amountEur - a.amountEur),
  };
  return Response.json(body);
}
