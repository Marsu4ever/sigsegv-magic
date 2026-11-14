/**
 * GET /api/what-if — for the what-if view's toggle and buttons. No AI involved. Response: WhatIf.
 * Params: target=<JSON SpendingTarget> (what the panel sends) OR category=<free text> (handy for curl),
 *         months=1|3|6 (default 1), cut=5|10|20 (default 5; anything else → 5).
 * Default target: the customer's biggest everyday group (getDefaultTarget). Bad months / unknown target → 400.
 */
import { connection } from "next/server";
import { FORECAST_MONTHS } from "@/lib/types";
import {
  getDefaultTarget,
  getWhatIf,
  parseCutPct,
  parseMonths,
  parseTarget,
} from "@/lib/insights/whatIfForecast";
import { resolveTarget } from "@/lib/insights/targets";
import { withPickedCustomer } from "@/lib/data/request";

export async function GET(request: Request) {
  await connection(); // WHY: compute per request, not frozen at build time (same as /api/week)
  const q = new URL(request.url).searchParams;
  const rawMonths = q.get("months");
  const months = rawMonths === null ? 1 : parseMonths(rawMonths);
  if (!months) {
    return Response.json(
      { error: `months must be one of ${FORECAST_MONTHS.join(", ")}` },
      { status: 400 },
    );
  }
  try {
    // WHY withPickedCustomer: the same customer as the chat (the one picked in the app).
    const w = await withPickedCustomer(() => {
      const target = q.has("target")
        ? parseTarget(q.get("target"))
        : q.has("category")
          ? resolveTarget(q.get("category") ?? "")
          : getDefaultTarget();
      return target ? getWhatIf(target, months, parseCutPct(q.get("cut"))) : null;
    });
    if (!w) return Response.json({ error: "Unknown or invalid target" }, { status: 400 });
    console.log(
      `[api/what-if] ${w.target.label} months=${w.months} cut=${w.cutPct}% → ${w.status}` +
        `${w.emptyReason ? ` (${w.emptyReason})` : ""} withData=[${w.monthsWithData}]`,
    );
    return Response.json(w);
  } catch (err) {
    console.error("[api/what-if]", err);
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Could not build the what-if.", detail }, { status: 500 });
  }
}
