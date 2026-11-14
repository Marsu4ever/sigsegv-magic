/**
 * Which language a lesson card uses: the language of the user's last message.
 * WHY a tiny heuristic: the coach already answers in the user's language; the card must
 * match it. Kept in one function so it's easy to replace (PLAN-financial-education.md §4.4).
 */
import type { LessonLang } from "@/lib/types";

const FINNISH =
  /[äöå]|\b(mitä|mikä|kuinka|paljon|säästä\w*|rahaa?|kulu\w*|minun|onko|miten|kyllä|joo|juu|näytä|arvaa)\b/i;

export function detectLang(text: string): LessonLang {
  return FINNISH.test(text) ? "fi" : "en";
}
