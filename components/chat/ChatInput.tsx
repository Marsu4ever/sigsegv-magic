"use client";
/**
 * The text box + send button, and (once a chat has started) a lightbulb button that
 * brings back the suggested questions (see ChatView).
 * TTS / voice input can be added here later (team noted it as a "later" feature).
 */
import { useState } from "react";
import { tapHaptic } from "@/lib/haptic";

export function ChatInput({
  onSend,
  disabled,
  onToggleSuggestions,
  suggestionsOpen = false,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
  /** Shows the lightbulb button when set. */
  onToggleSuggestions?: () => void;
  suggestionsOpen?: boolean;
}) {
  const [text, setText] = useState("");
  // Bumped on every send → replays the button's little pop (key change restarts the animation).
  const [sent, setSent] = useState(0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || disabled) return;
    tapHaptic();
    setSent((n) => n + 1);
    onSend(t);
    setText("");
  }

  return (
    <form onSubmit={submit} className="flex gap-2 border-t border-line bg-surface p-2">
      {onToggleSuggestions && (
        <button
          type="button"
          onClick={onToggleSuggestions}
          aria-label={suggestionsOpen ? "Hide suggested questions" : "Show suggested questions"}
          aria-expanded={suggestionsOpen}
          title="Suggested questions"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${
            suggestionsOpen
              ? "border-accent bg-accent text-accent-foreground"
              : "border-line bg-background text-muted"
          }`}
        >
          <LightbulbIcon />
        </button>
      )}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ask about your money…"
        // WHY text-base (16px): smaller text makes iOS zoom in on focus.
        className="min-w-0 flex-1 rounded-full border border-line bg-background px-4 py-2 text-base outline-none focus:border-accent"
        aria-label="Message"
      />
      {/* Send: faded until there's text, then wakes up; presses in; pops when a message goes. */}
      <button
        key={sent}
        type="submit"
        disabled={disabled || !text.trim()}
        className={`flex items-center gap-1.5 rounded-full bg-accent px-4 font-semibold text-accent-foreground transition-all duration-200 hover:brightness-110 active:scale-90 disabled:scale-95 disabled:opacity-40 ${
          sent ? "send-pop" : ""
        }`}
      >
        Send
        <SendIcon />
      </button>
    </form>
  );
}

function LightbulbIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 18h6M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}
