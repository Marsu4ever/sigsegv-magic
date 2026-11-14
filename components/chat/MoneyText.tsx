/**
 * The coach's reply text, with marked amounts colored:
 *   {+1 250 €} → green (money coming in, kept, saved, a better choice)
 *   {-85 €}    → red   (money going out: spending, bills, costs)
 * The braces and the +/− marker are not shown. Unmarked text stays as it is.
 *
 * WHY markers in the text: only the AI knows which number in its sentence means
 * what. It is told to mark them in lib/ai/prompt.ts ("Money colors" under HOW TO ANSWER); the mock does the same.
 * The numbers themselves still come from the tools — the marker is just the color.
 */

/**
 * WHY this forgiving: models don't always copy the marker exactly. Seen / likely variants:
 * "{−85 €}" (typographic minus U+2212), "{–85 €}" (en dash), "{ -85 € }" (spaces), and "{85 €}"
 * (no sign). The old pattern only matched "{+…" / "{-…", so those showed with their braces.
 * A digit is required inside, so ordinary braces (if any) are left alone.
 */
const MONEY_MARK = /\{\s*([+\-−–])?\s*([^{}\n]{0,40}?\d[^{}\n]{0,40}?)\s*\}/g;

/**
 * Words that say what an amount is, English + Finnish. The nearest one before a marker wins.
 * WHY: the AI sometimes picks the wrong sign — "you'd save about {-142,30 €}" showed red.
 * (?<!\p{L}) / (?!\p{L}) instead of \b: \b doesn't treat ä / ö as letters.
 */
const CUE_IN =
  /(?<!\p{L})(sav(?:e|es|ed|ing|ings)|keep|keeps|kept|earn(?:s|ed)?|income|salary|refund(?:s|ed)?|säästä\p{L}*|säästö\p{L}*|tulo(?:t|ja|si)?|palk\p{L}*)(?!\p{L})/giu;
const CUE_OUT =
  /(?<!\p{L})(spen(?:d|ds|t|ding)|cost(?:s|ing)?|pa(?:y|ys|id|ying)|bills?|charged?|kulu\p{L}*|maks\p{L}*|käyt(?:it|ti|tää|ät)\p{L}*|menot?)(?!\p{L})/giu;

/** "in" / "out" from the nearest cue word at the end of `before`, or undefined if none. */
function cueTone(before: string): "in" | "out" | undefined {
  const lastIndex = (re: RegExp) => Math.max(-1, ...[...before.matchAll(re)].map((m) => m.index ?? -1));
  const inAt = lastIndex(CUE_IN);
  const outAt = lastIndex(CUE_OUT);
  if (inAt < 0 && outAt < 0) return undefined;
  return inAt > outAt ? "in" : "out";
}

/** How far back to look for a cue word: this sentence, at most 60 characters. */
function lookBehind(text: string, from: number, start: number): string {
  const window = text.slice(Math.max(from, start - 60), start);
  const sentenceStart = Math.max(...[". ", "! ", "? ", "\n"].map((e) => window.lastIndexOf(e)));
  return sentenceStart >= 0 ? window.slice(sentenceStart + 1) : window;
}

/** Text split into plain strings and marked amounts. tone undefined = no sign → neutral. */
export function splitMoney(text: string): (string | { amount: string; tone?: "in" | "out" })[] {
  const parts: (string | { amount: string; tone?: "in" | "out" })[] = [];
  let last = 0;
  for (const m of text.matchAll(MONEY_MARK)) {
    const start = m.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    const marked = m[1] ? (m[1] === "+" ? "in" : "out") : undefined;
    // WHY: when the words right before the amount contradict its sign, we can't tell which
    // is right, so no color (a wrong color is worse than none). No cue word → trust the sign.
    const cue = marked && cueTone(lookBehind(text, last, start));
    parts.push({ amount: m[2].trim(), tone: cue && cue !== marked ? undefined : marked });
    last = start + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/**
 * A colored amount in a reply; savings glow once (app/globals.css, "Delight").
 * WHY no count-up here (tried 14 Nov): a number changing width mid-sentence made the
 * whole reply jump or left a gap. Big standalone numbers still count up (CountUp).
 */
function AnimatedAmount({ amount, tone }: { amount: string; tone: "in" | "out" }) {
  return tone === "in" ? <span className="save-glow">{amount}</span> : <>{amount}</>;
}

export function MoneyText({
  text,
  colors = true,
  animate = false,
}: {
  text: string;
  /** false = amounts bold but not green/red (calmer, e.g. the Account tab's hook tiles). */
  colors?: boolean;
  /** true = savings glow once when they appear (chat replies). */
  animate?: boolean;
}) {
  return (
    <>
      {splitMoney(text).map((p, i) =>
        typeof p === "string" ? (
          p
        ) : p.tone ? (
          <span
            key={i}
            className={`font-semibold ${!colors ? "" : p.tone === "in" ? "text-money-in" : "text-money-out"}`}
          >
            {animate && p.tone ? <AnimatedAmount amount={p.amount} tone={p.tone} /> : p.amount}
          </span>
        ) : (
          // WHY plain: no sign = the model wrapped a neutral amount (a balance, a price), which the
          // prompt says to leave uncolored. Dropping the braces is all that's needed.
          p.amount
        ),
      )}
    </>
  );
}
