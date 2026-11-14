/**
 * GET /api/data-file?path=benchmarks.json — shows one data file (read-only).
 * Only files listed by listDataFiles() can be opened (WHY: never serve
 * arbitrary paths from the server's disk). Linked from the /dev hub.
 */
import { connection } from "next/server";
import { readDataFile } from "@/lib/data/files";

export async function GET(request: Request) {
  await connection();
  const rel = new URL(request.url).searchParams.get("path") ?? "";
  const content = readDataFile(rel);
  if (content === null) {
    return Response.json({ error: `Not a viewable data file: "${rel}"` }, { status: 404 });
  }
  return new Response(content, { headers: { "Content-Type": "application/json; charset=utf-8" } });
}
