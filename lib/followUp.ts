/**
 * The coach (real or mock) ends a reply with one offer as a button: "… Want to see how you could save?
 * [[Show me how I could save]]". This splits that marker off the text.
 * WHY a marker in the text (not a separate field): the reply text goes back to the AI with
 * the conversation, so it still sees its own offer and understands a typed "yes".
 * Rule for the AI: "HOW TO ANSWER" in lib/ai/prompt.ts; the mock does the same (lib/ai/mock.ts).
 * Shown as a button by components/chat/MessageBubble.tsx. Safe in client code.
 */
const FOLLOW_UP = /\[\[([^[\]\n]{1,60})\]\]/g;

/** Text without [[…]] markers, and the last marker's text (the offer), if any. */
export function splitFollowUp(text: string): { body: string; followUp: string | null } {
  const offers = [...text.matchAll(FOLLOW_UP)].map((m) => m[1].trim()).filter(Boolean);
  return {
    body: text.replace(FOLLOW_UP, "").trimEnd(),
    followUp: offers.at(-1) ?? null,
  };
}
