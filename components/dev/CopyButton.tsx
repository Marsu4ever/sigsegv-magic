"use client";
import { useState } from "react";

/** Small "copy to clipboard" button for team pages. */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard can be blocked (e.g. not on localhost/https) — select manually then.
        }
      }}
      className="shrink-0 rounded border border-line px-2 py-0.5 text-xs text-accent"
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}
