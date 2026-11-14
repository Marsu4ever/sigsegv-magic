/**
 * GET /api/customers — the demo customers for the switcher at the top of the app,
 * and which one is in use. Picking one is done in the browser (lib/demoCustomer.ts).
 * Response: DemoCustomersResponse (see lib/types.ts).
 */
import { connection } from "next/server";
import type { DemoCustomersResponse } from "@/lib/types";
import { getDefaultCustomerId } from "@/lib/data";
import { allProfiles, SPENDING_TYPES } from "@/lib/data/profiles";
import { pickedCustomerId } from "@/lib/data/request";

export async function GET() {
  await connection();
  try {
    const picked = await pickedCustomerId();
    const label = new Map(SPENDING_TYPES.map((t) => [t.type, t.label]));
    const body: DemoCustomersResponse = {
      current: picked ?? getDefaultCustomerId(),
      defaultId: getDefaultCustomerId(),
      picked: picked !== undefined,
      customers: allProfiles().map((p) => ({
        id: p.id,
        age: p.age,
        typeLabel: label.get(p.type) ?? p.type,
        incomePerMonth: p.incomePerMonth,
        spendingPerMonth: p.spendingPerMonth,
        mortgage: p.mortgage && {
          decision: p.mortgage.decision,
          rejectionReason: p.mortgage.rejectionReason,
          salarySweep: p.mortgage.salarySweep,
        },
      })),
    };
    return Response.json(body);
  } catch (err) {
    console.error("[api/customers]", err);
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Could not list the demo customers.", detail }, { status: 500 });
  }
}
