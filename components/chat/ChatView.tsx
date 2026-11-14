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
import type { ChatMessage, ChatResponse, SpendingTarget, WhatIf } from "@/lib/types";
import { WhatIfPanel } from "@/components/whatif/WhatIfPanel";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";

/**
 * WHY a client-side limit too: even if the server never answers (crash,
 * network drop), the chat shows an error instead of "Thinking…" forever.
 * Must be longer than the server's worst case (2 tries × 30s × a few rounds).
 */
const CLIENT_TIMEOUT_MS = 120_000;

// Suggested starter questions (from the challenge brief). Edit freely.
// The what-if chip is added at WHAT_IF_CHIP_AT once /api/what-if/suggestion answers.
const SUGGESTIONS = [
  "What kind of spender am I?",
  "Where does my money slip away?",
  "What's safe for me to spend this week?",
  "How are my 3 baskets looking?",
  "Show my spending calendar",
  "How am I doing this month?",
];

const WHAT_IF_CHIP_AT = 2;

/** GET /api/what-if/suggestion response. */
type WhatIfSuggestion = { target: SpendingTarget };

/**
 * "What if I spent less on groceries?" — X is the customer's biggest everyday category.
 * Opens the what-if view (chart + Month / 3 / 6 months + 5 / 10 / 20 %); the AI / mock finds X
 * in the text. WHY no % in the chip: the user picks it under the chart.
 */
function whatIfChipText(s: WhatIfSuggestion): string {
  return `What if I spent less on ${s.target.label.toLowerCase()}?`;
}

export function ChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<ChatResponse["mode"] | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  // What-if mode: a reply with `whatIf` shows WhatIfPanel above the conversation.
  const [whatIf, setWhatIf] = useState<WhatIf | null>(null);
  // WHY a counter: used as the panel's React key, so each new what-if starts fresh.
  const [whatIfKey, setWhatIfKey] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const [whatIfChip, setWhatIfChip] = useState<string | null>(null);

  // WHY fetch, not hard-coded: X depends on the customer's data (server-only lib/insights).
  // On failure the chip is just left out — the other suggestions still work.
  useEffect(() => {
    fetch("/api/what-if/suggestion")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.detail || json.error || `HTTP ${res.status}`);
        setWhatIfChip(whatIfChipText(json as WhatIfSuggestion));
      })
      .catch((err) => console.error("[what-if suggestion]", err)); // browser DevTools console
  }, []);

  const suggestions = whatIfChip
    ? [...SUGGESTIONS.slice(0, WHAT_IF_CHIP_AT), whatIfChip, ...SUGGESTIONS.slice(WHAT_IF_CHIP_AT)]
    : SUGGESTIONS;

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

  // Set by addNotice: the next messages change must not scroll.
  const skipScroll = useRef(false);

  // Keep the newest message in view.
  useEffect(() => {
    if (skipScroll.current) {
      skipScroll.current = false;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  /** A note from the what-if panel, shown as a coach message (no AI involved). */
  function addNotice(text: string) {
    // WHY no auto-scroll: the user is looking at the what-if chart; jumping away would lose it.
    skipScroll.current = true;
    setMessages((m) => [...m, { role: "assistant", text }]);
  }

  // WHY after the auto-scroll above: otherwise scrolling to the newest message hides the
  // chart the user just asked for.
  useEffect(() => {
    if (whatIfKey > 0) panelRef.current?.scrollIntoView({ block: "start" });
  }, [whatIfKey]);

  function showWhatIf(w: WhatIf) {
    setWhatIf(w);
    setWhatIfKey((k) => k + 1);
  }

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
      setMessages((m) => [...m, reply]); // WHY functional: keeps notes added while waiting
      if (reply.whatIf) showWhatIf(reply.whatIf);
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
      setMessages((m) => [...m, { role: "assistant", text: `⚠️ ${text}` }]);
    } finally {
      setLoading(false);
    }
  }

  // A question handed over from another tab, e.g. /chat?ask=… from the Home loan tab.
  useEffect(() => {
    const ask = new URLSearchParams(window.location.search).get("ask");
    if (!ask) return;
    // WHY a timer + cleanup: React dev mode runs effects twice; the first timer
    // is cancelled, so the question is asked exactly once.
    const id = setTimeout(() => {
      window.history.replaceState(null, "", "/chat"); // a reload shouldn't ask again
      send(ask);
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on open
  }, []);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3">
        <h1 className="font-semibold">Money Coach</h1>
        {mode === "mock" && (
          <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning">
            mock AI
          </span>
        )}
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
        {messages.length === 0 && (
          <div className="space-y-3 pt-6 text-center">
            <p className="text-muted">Ask anything about your money.</p>
            <div className="flex flex-col items-center gap-2">
              {suggestions.map((s) => (
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
        {whatIf && (
          <div ref={panelRef} className="scroll-mt-2">
            <WhatIfPanel
              key={whatIfKey}
              initial={whatIf}
              onClose={() => setWhatIf(null)}
              onNotice={addNotice}
            />
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
