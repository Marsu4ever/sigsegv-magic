/**
 * GET /api/lessons — the lesson cards this customer can do (lib/education/topics.ts), for the
 * progress list in Home's coach insights. No AI involved. Response: LessonsResponse.
 * WHY a list from the server: whether a lesson fits depends on the customer's data (e.g. no ASP
 * lesson for someone who already has a home loan). Progress itself is kept on the device.
 */
import { connection } from "next/server";
import type { LessonsResponse } from "@/lib/types";
import { withPickedCustomer } from "@/lib/data/request";
import { availableLessons } from "@/lib/education/topics";

export async function GET() {
  await connection();
  try {
    const body: LessonsResponse = await withPickedCustomer(() => ({ lessons: availableLessons("en") }));
    return Response.json(body);
  } catch (err) {
    console.error("[api/lessons]", err);
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Could not load lessons.", detail }, { status: 500 });
  }
}
