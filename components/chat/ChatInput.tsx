"use client";
/**
 * The text box + send button, and (once a chat has started) a lightbulb button that
 * brings back the suggested questions (see ChatView).
 * TTS / voice input can be added here later (team noted it as a "later" feature).
 */
import { useState } from "react";

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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || disabled) return;
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
      <button
        type="submit"
        disabled={disabled || !text.trim()}
        className="rounded-full bg-accent px-4 font-semibold text-accent-foreground disabled:opacity-40"
      >
        Send
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
