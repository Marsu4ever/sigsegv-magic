/**
 * Checks that every € amount in the coach's reply came from a tool. Owner: AI person.
 * SERVER ONLY (used by lib/ai/chat.ts). Pure functions, no data access.
 *
 * WHY: twice the model wrote amounts no tool returned (CUST01350: "Cafes €48.20", then
 * "€142.30" for restaurants). Rule 2 of the prompt forbids it, but a prompt is not a guarantee.
 * chat.ts sends the reply back once when an amount can't be found in this turn's tool results
 * or earlier in the conversation.
 */

/** A number as written by the coach: "1,520.86" (English) or "1 520,86" (Finnish). */
const NUMBER = String.raw`\d{1,3}(?:[  ,.]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
/** "€85", "€ 1,520.86", "-€85", "1 520,86 €". */
const EURO_AMOUNT = new RegExp(String.raw`€\s?(${NUMBER})|(${NUMBER})\s?€`, "g");

/** "1,520.86" / "1 520,86" / "1.520,86" / "85" → 1520.86 / 1520.86 / 1520.86 / 85. */
export function parseAmount(raw: string): number {
  let s = raw.replace(/[\s ]/g, "");
  const comma = s.lastIndexOf(",");
  const dot = s.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    s = dot > comma ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
  } else if (comma >= 0) {
    s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (dot >= 0 && /\.\d{3}$/.test(s)) {
    s = s.replace(/\./g, ""); // "1.520" = thousands
  }
  return Number(s);
}

/** Every € amount written in a text (amounts without € are not checked). */
export function euroAmounts(text: string): { raw: string; value: number }[] {
  return [...text.matchAll(EURO_AMOUNT)].map((m) => ({
    raw: m[0].trim(),
    value: parseAmount(m[1] ?? m[2]),
  }));
}

/** Every number in tool results (JSON) — signs dropped, since the coach writes "€12" for −12. */
export function numbersIn(json: string): number[] {
  return [...json.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}

/**
 * The reply's € amounts that match none of `known`.
 * A match: the same to the cent, or the same rounded to whole euros (the prompt allows that).
 */
export function unsupportedAmounts(reply: string, known: number[]): string[] {
  return euroAmounts(reply)
    .filter(
      ({ value }) =>
        !known.some(
          (n) => Math.abs(n - value) < 0.011 || (Number.isInteger(value) && Math.round(n) === value),
        ),
    )
    .map((a) => a.raw);
}

/**
 * The reply without the sentences that hold `amounts` (as returned by unsupportedAmounts).
 * [[offer]] lines are kept. WHY: last resort when the model keeps a made-up amount even
 * after the retry; a shorter true answer beats a wrong number. Empty → "".
 */
export function dropSentencesWith(text: string, amounts: string[]): string {
  return text
    .split("\n")
    .map((line) =>
      /^\s*\[\[.*\]\]\s*$/.test(line)
        ? line
        : line
            .split(/(?<=[.!?])\s+/)
            .filter((sentence) => !amounts.some((a) => sentence.includes(a)))
            .join(" "),
    )
    .filter((line) => line.trim())
    .join("\n");
}
