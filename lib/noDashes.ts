/**
 * Team style: the coach never uses long dashes ("—", or a spaced "–") in its text.
 * The prompt asks for it ("HOW TO ANSWER" in lib/ai/prompt.ts); this makes sure, because
 * models often keep using them anyway. Number ranges like "5–10" are left alone.
 * Used on the server (lib/ai/chat.ts) and on screen (components/chat/MessageBubble.tsx).
 * Safe in client code.
 */
export function noLongDashes(text: string): string {
  return text
    .replace(/[ \t]*—[ \t]*/g, ", ") // "a — b" / "a—b" → "a, b"
    .replace(/[ \t]+–[ \t]+/g, ", ") // a spaced en dash used as a dash
    .replace(/([.!?:;,]), /g, "$1 ") // "done. — Next" → "done. Next", not "done., Next"
    .replace(/^, /gm, ""); // a line that started with a dash
}
