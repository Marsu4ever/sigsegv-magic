/**
 * The coach's reply text, with marked amounts colored:
 *   {+€1,250} → green (money coming in, kept, saved, a better choice)
 *   {-€85}    → red   (money going out: spending, bills, costs)
 * The braces and the +/− marker are not shown. Unmarked text stays as it is.
 *
 * WHY markers in the text: only the AI knows which number in its sentence means
 * what. It is told to mark them in lib/ai/prompt.ts ("Money colors" under HOW TO ANSWER); the mock does the same.
 * The numbers themselves still come from the tools — the marker is just the color.
 */
const MONEY_MARK = /\{([+-])([^{}\n]{1,40})\}/g;

export function MoneyText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MONEY_MARK)) {
    const start = m.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <span
        key={start}
        className={`font-semibold ${m[1] === "+" ? "text-money-in" : "text-money-out"}`}
      >
        {m[2].trim()}
      </span>,
    );
    last = start + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}
