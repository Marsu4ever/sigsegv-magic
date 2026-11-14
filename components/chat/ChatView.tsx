"use client";
/**
 * The chat screen. Owner: UI person.
 *
 * FLOW: user sends text → we POST the whole conversation to /api/chat →
 * the server runs the AI (lib/ai/chat.ts) → we append the reply.
 *
 * WHY the whole conversation each time: the server keeps no state, so it
 * can't lose anything and any teammate's server gives the same answer.
 * NOTE: the conversation resets on page reload. Fine for a demo; add
 * localStorage later if needed.
 */
import { useEffect, useRef, useState } from "react";
import type { ChatMessage, ChatResponse } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";

/**
 * WHY a client-side limit too: even if the server never answers (crash,
 * network drop), the chat shows an error instead of "Thinking…" forever.
 * Must be longer than the server's worst case (2 tries × 30s × a few rounds).
 */
const CLIENT_TIMEOUT_MS = 120_000;

// Suggested starter questions (from the challenge brief). Edit freely.
const SUGGESTIONS = [
  "What kind of spender am I?",
  "Where does my money slip away?",
  "How much could I save if I cut restaurants by 20%?",
  "What's safe for me to spend this week?",
  "How are my 3 baskets looking?",
  "Show my spending calendar",
  "How am I doing this month?",
];

export function ChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<ChatResponse["mode"] | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Count seconds while waiting, so a slow answer is visibly "still working".
  useEffect(() => {
    if (!loading) return;
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => {
      clearInterval(id);
      setElapsed(0);
    };
  }, [loading]);

  // Keep the newest message in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const next: ChatMessage[] = [...messages, { role: "user", text }];
    setMessages(next);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });
      // WHY read text first: if the server crashed it may send HTML, not JSON.
      const raw = await res.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(
          `Server sent a non-JSON reply (HTTP ${res.status}). Check the npm run dev terminal.`,
        );
      }
      if (!res.ok) throw new Error(data.detail || data.error || `HTTP ${res.status}`);
      const { reply, mode } = data as ChatResponse;
      setMode(mode);
      setMessages([...next, reply]);
    } catch (err) {
      const text =
        err instanceof DOMException && err.name === "TimeoutError"
          ? `No answer after ${CLIENT_TIMEOUT_MS / 1000}s. Check the npm run dev terminal for [ai] lines.`
          : err instanceof TypeError
            ? "Could not reach the server. Is npm run dev still running?"
            : err instanceof Error
              ? err.message
              : String(err);
      console.error("[chat]", err); // browser DevTools console
      setMessages([...next, { role: "assistant", text: `⚠️ ${text}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3">
        <h1 className="font-semibold">Money Coach</h1>
        {mode === "mock" && (
          <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">
            mock AI
          </span>
        )}
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
        {messages.length === 0 && (
          <div className="space-y-3 pt-6 text-center">
            <p className="text-muted">Ask anything about your money.</p>
            <div className="flex flex-col items-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}
        {loading && <p className="text-sm text-muted">Thinking…{elapsed >= 3 && ` ${elapsed}s`}</p>}
        <div ref={bottomRef} />
      </div>

      <ChatInput onSend={send} disabled={loading} />
    </div>
  );
}
