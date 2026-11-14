/**
 * POST /api/chat — the frontend sends the conversation, gets the coach's reply.
 * Body: ChatRequest → Response: ChatResponse (see lib/types.ts).
 *
 * WHY this file is thin: all logic lives in lib/ai/chat.ts so it can be
 * tested and changed without touching the HTTP layer.
 */
import type { ChatRequest, ChatResponse } from "@/lib/types";
import { runChat } from "@/lib/ai/chat";

export async function POST(request: Request) {
  let body: ChatRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "messages must be a non-empty array" }, { status: 400 });
  }

  try {
    const result: ChatResponse = await runChat(body.messages);
    return Response.json(result);
  } catch (err) {
    // WHY log + generic message: the terminal running `npm run dev` shows
    // the real error for debugging; the phone just gets a friendly message.
    console.error("[api/chat]", err);
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "The AI failed to answer.", detail }, { status: 502 });
  }
}
