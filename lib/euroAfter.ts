/**
 * Team style: euros are written the Finnish way, number first: "1 520,86 €", never "€1,520.86".
 * Same style as every other screen (formatValue in components/charts/format.ts).
 * The prompt asks for it ("HOW TO ANSWER" in lib/ai/prompt.ts); this makes sure, because
 * models trained on English text often put the € first anyway.
 * Used on the server (lib/ai/chat.ts) and on screen (components/chat/MessageBubble.tsx).
 * Safe in client code.
 */

// "€85", "€ 85", "€1,520.86", "€1 520,86", "€12.5": the € and the amount right after it.
// Thousands: groups of exactly 3 digits after "," or a space. Cents: 1–2 digits after "." or ",".
const EURO_FIRST = /€[  ]?(\d{1,3}(?:[,   ]\d{3})+|\d+)(?:[.,](\d{1,2}))?(?!\d)/g;

/** "Restaurants came to {-€1,520.86}" → "Restaurants came to {-1 520,86 €}". */
export function euroAfter(text: string): string {
  return text.replace(EURO_FIRST, (_match, whole: string, cents?: string) => {
    const value = Number(whole.replace(/\D/g, "")) + (cents ? Number(`0.${cents}`) : 0);
    const digits = cents ? 2 : 0;
    const number = value.toLocaleString("fi-FI", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    // WHY a no-break space: the € never ends up alone at the start of the next line.
    return `${number} €`;
  });
}
