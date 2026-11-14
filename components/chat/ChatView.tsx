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
import { Fragment, useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { SkeletonBubble, SkeletonGroup, SkeletonRows } from "@/components/ui/Skeleton";
import type { ChatMessage, ChatResponse, SpendingTarget, InsightsResponse } from "@/lib/types";
import { WhatIfPanel } from "@/components/whatif/WhatIfPanel";
import { CHAT_RESET_EVENT, getChatResetCount } from "@/lib/chatReset";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { DevHeaderButton } from "@/components/DevButton";

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

/** A quiet icon for each suggestion, picked by keywords (unknown → sparkles). */
function suggestionIcon(text: string): IconName {
  const q = text.toLowerCase();
  if (q.includes("spender")) return "user";
  if (q.includes("slip")) return "coins";
  if (q.includes("what if")) return "sliders";
  if (q.includes("safe")) return "shield";
  if (q.includes("basket")) return "basket";
  if (q.includes("calendar")) return "calendar";
  if (q.includes("this month")) return "trend";
  return "sparkles";
}

/** The app's little logo: a green rounded tile with a leaf (calm, "growing money"). */
function LogoMark({ size }: { size: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center bg-accent text-accent-foreground shadow-sm"
      style={{ width: size, height: size, borderRadius: size * 0.3 }}
      aria-hidden="true"
    >
      <Icon name="leaf" size={Math.round(size * 0.55)} strokeWidth={2.2} />
    </span>
  );
}

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
  // What-if mode: the latest reply with `whatIf` shows WhatIfPanel right above its text, so the
  // chart comes first and the coach's explanation sits under it — from the landing chip or a
  // follow-up deep in the chat alike. WHY one panel: a new what-if replaces the old one (fresh state).
  const [whatIfReply, setWhatIfReply] = useState<ChatMessage | null>(null);
  // WHY a counter: used as the panel's React key, so each new what-if starts fresh.
  const [whatIfKey, setWhatIfKey] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const [whatIfChip, setWhatIfChip] = useState<string | null>(null);
  // The lightbulb next to the text box: suggested questions again, mid-conversation.
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  // WHY: someone who keeps little of their income may not know it. The coach says so
  // first, before they ask (lib/insights/proactive.ts, "save_help").
  const [opener, setOpener] = useState<ChatMessage | null>(null);
  // WHY wait for both before showing the start screen (skeleton meanwhile): they used to
  // pop in one by one after the page had drawn, pushing everything down.
  const [startReady, setStartReady] = useState(false);
  useEffect(() => {
    const insights = fetch("/api/insights")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: InsightsResponse | null) => {
        // WHY by id, not kind: the gentler 10 % "save-tip" is for people who already save;
        // the opener is only for those who keep (almost) nothing.
        const help = json?.insights.find((i) => i.id === "save-help");
        if (!help) return;
        // WHY the hook, not the full detail: one fact and one number, then the offer.
        setOpener({
          role: "assistant",
          text: `${help.title}. ${help.hook}. Want to see how?\n[[${help.ask}]]`,
        });
      })
      .catch((err) => console.error("[insights]", err));

    // WHY fetch, not hard-coded: X depends on the customer's data (server-only lib/insights).
    // On failure the chip is just left out — the other suggestions still work.
    const chip = fetch("/api/what-if/suggestion")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.detail || json.error || `HTTP ${res.status}`);
        setWhatIfChip(whatIfChipText(json as WhatIfSuggestion));
      })
      .catch((err) => console.error("[what-if suggestion]", err)); // browser DevTools console

    Promise.allSettled([insights, chip]).then(() => setStartReady(true));
  }, []);

  const suggestions = whatIfChip
    ? [...SUGGESTIONS.slice(0, WHAT_IF_CHIP_AT), whatIfChip, ...SUGGESTIONS.slice(WHAT_IF_CHIP_AT)]
    : SUGGESTIONS;

  // WHY leave out what was already asked: the lightbulb should offer what the user
  // hasn't explored yet. If they've asked everything, show the full list again.
  const asked = new Set(messages.filter((m) => m.role === "user").map((m) => m.text));
  const notAskedYet = suggestions.filter((s) => !asked.has(s));
  const moreSuggestions = notAskedYet.length ? notAskedYet : suggestions;

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

  function showWhatIf(reply: ChatMessage) {
    setWhatIfReply(reply);
    setWhatIfKey((k) => k + 1);
  }

  // The request in flight, so "new chat" can cancel it (its late reply must not show up).
  const inFlight = useRef<AbortController | null>(null);

  /** Back to the start screen with the suggested questions. */
  function resetChat() {
    inFlight.current?.abort();
    inFlight.current = null;
    setMessages([]);
    setWhatIfReply(null);
    setLoading(false);
    window.scrollTo({ top: 0 });
  }

  // Tapping the Chat tab starts a new chat (see lib/chatReset.ts).
  const seenReset = useRef(getChatResetCount());
  useEffect(() => {
    const check = () => {
      if (getChatResetCount() === seenReset.current) return;
      seenReset.current = getChatResetCount();
      resetChat();
    };
    check(); // the tab was tapped while this page was hidden
    window.addEventListener(CHAT_RESET_EVENT, check);
    return () => window.removeEventListener(CHAT_RESET_EVENT, check);
  }, []);

  /** `context`: a coach message to start from, e.g. an insight opened on Home (?ctx=). */
  async function send(text: string, context?: string) {
    setSuggestionsOpen(false);
    // WHY: the opener becomes part of the chat once the user answers, so the AI
    // knows what it offered (and a typed "yes" works). An insight from Home replaces it:
    // the coach then continues from what the card said, with the same numbers.
    const base: ChatMessage[] = context
      ? [...messages, { role: "assistant", text: context }]
      : messages.length === 0 && opener
        ? [opener]
        : messages;
    const next: ChatMessage[] = [...base, { role: "user", text }];
    setMessages(next);
    setLoading(true);
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(CLIENT_TIMEOUT_MS)]),
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
      if (controller.signal.aborted) return; // new chat started meanwhile
      const { reply, mode } = data as ChatResponse;
      setMode(mode);
      setMessages((m) => [...m, reply]); // WHY functional: keeps notes added while waiting
      if (reply.whatIf) showWhatIf(reply);
    } catch (err) {
      if (controller.signal.aborted) return; // user started a new chat — drop it quietly
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
      if (inFlight.current === controller) {
        inFlight.current = null;
        setLoading(false);
      }
    }
  }

  // A question handed over from another tab, e.g. /chat?ask=… from the Home loan tab,
  // optionally with ?ctx=… (an insight's title + explanation, from Home's coach insights).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ask = params.get("ask");
    const ctx = params.get("ctx") ?? undefined;
    if (!ask) return;
    // WHY a timer + cleanup: React dev mode runs effects twice; the first timer
    // is cancelled, so the question is asked exactly once.
    const id = setTimeout(() => {
      window.history.replaceState(null, "", "/chat"); // a reload shouldn't ask again
      send(ask, ctx);
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on open
  }, []);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3">
        <h1 className="flex items-center gap-2 font-semibold">
          <LogoMark size={26} />
          Money Coach
        </h1>
        <div className="flex items-center gap-2">
          {mode === "mock" && (
            <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning">
              mock AI
            </span>
          )}
          <DevHeaderButton />
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
        {messages.length === 0 && (
          // Welcome + suggestions as one tidy list (team call: the old centred
          // pill stack looked homemade).
          <div className="mx-auto max-w-md space-y-5 px-1 pt-6">
            <div className="flex flex-col items-center text-center">
              <LogoMark size={52} />
              <h2 className="mt-3 text-xl font-semibold">Hi! I&apos;m your money coach.</h2>
              <p className="mt-1 text-sm text-muted">
                Ask anything — I answer with your real numbers.
              </p>
            </div>

            {/* WHY below the greeting: the coach says hi first, then what it noticed. */}
            {opener && <MessageBubble message={opener} onFollowUp={send} />}

            <div>
              <p className="mb-2 px-1 text-xs font-medium text-muted">Try asking</p>
              {!startReady ? (
                <SkeletonGroup className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                  <SkeletonRows rows={SUGGESTIONS.length + 1} />
                </SkeletonGroup>
              ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                  {suggestions.map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        onClick={() => send(s)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-background active:bg-background"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                          <Icon name={suggestionIcon(s)} size={17} />
                        </span>
                        <span className="flex-1">{s}</span>
                        <Icon name="chevron" size={16} className="text-muted" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          // WHY compare the object: the reply that opened the panel, wherever it is in the chat.
          <Fragment key={i}>
            {m === whatIfReply && m.whatIf && (
              <div ref={panelRef} className="scroll-mt-2">
                <WhatIfPanel
                  key={whatIfKey}
                  initial={m.whatIf}
                  onClose={() => setWhatIfReply(null)}
                  onNotice={addNotice}
                />
              </div>
            )}
            <MessageBubble
              message={m}
              // WHY only the latest reply: older offers are stale once the chat moved on.
              onFollowUp={i === messages.length - 1 && !loading ? send : undefined}
            />
          </Fragment>
        ))}
        {/* WHY a bubble skeleton: shows where the answer will appear. The seconds stay
            (after 3 s) so a slow model is visibly still working. */}
        {loading && (
          <SkeletonGroup className="space-y-1">
            <SkeletonBubble />
            {elapsed >= 3 && <p className="px-1 text-xs text-muted">Thinking… {elapsed}s</p>}
          </SkeletonGroup>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggested questions again, without starting a new chat (lightbulb in ChatInput). */}
      {suggestionsOpen && messages.length > 0 && (
        <div
          className="flex gap-2 overflow-x-auto border-t border-line bg-surface px-2 py-2"
          aria-label="Suggested questions"
        >
          {moreSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              disabled={loading}
              onClick={() => send(s)}
              className="shrink-0 whitespace-nowrap rounded-full border border-line bg-background px-3 py-1.5 text-sm disabled:opacity-40"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <ChatInput
        onSend={send}
        disabled={loading}
        // WHY only after the first message: before that, the suggestions are on screen already.
        onToggleSuggestions={messages.length > 0 ? () => setSuggestionsOpen((o) => !o) : undefined}
        suggestionsOpen={suggestionsOpen}
      />
    </div>
  );
}
