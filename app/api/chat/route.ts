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
  const start = Date.now();
  let body: ChatRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "messages must be a non-empty array" }, { status: 400 });
  }

  const question = body.messages.at(-1)?.text ?? "";
  console.log(`[api/chat] ← "${question.slice(0, 80)}" (${body.messages.length} messages)`);

  try {
    const result: ChatResponse = await runChat(body.messages);
    console.log(`[api/chat] → done in ${Date.now() - start}ms`);
    return Response.json(result);
  } catch (err) {
    // WHY the full error in the terminal but a short one in the chat:
    // the terminal is for debugging; the chat just needs to say what broke.
    console.error(`[api/chat] ✗ failed after ${Date.now() - start}ms:`, err);
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "The AI failed to answer.", detail }, { status: 502 });
  }
}
