"use client";
/**
 * The text box + send button.
 * TTS / voice input can be added here later (team noted it as a "later" feature).
 */
import { useState } from "react";

export function ChatInput({ onSend, disabled }: { onSend: (text: string) => void; disabled: boolean }) {
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
