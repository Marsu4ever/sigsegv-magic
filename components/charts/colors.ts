/**
 * Chart colors. Values point at the CSS variables in app/globals.css,
 * so the theme is changed in one place.
 */
import { BASKET_LABELS } from "@/lib/types";

export const SERIES_COLORS = [
  "var(--accent)",
  "var(--basket-regular)",
  "var(--basket-irregular)",
  "var(--basket-everyday)",
  "#7a5cc7",
  "#3a9fa8",
  "#8c8c3a",
  "#a35a2f",
];

/** WHY: a basket should always have the same color, in every chart and tab. */
const BASKET_COLOR_BY_LABEL: Record<string, string> = {
  [BASKET_LABELS.mandatory_regular]: "var(--basket-regular)",
  [BASKET_LABELS.mandatory_irregular]: "var(--basket-irregular)",
  [BASKET_LABELS.everyday]: "var(--basket-everyday)",
};

export function basketColor(label: string): string | undefined {
  return BASKET_COLOR_BY_LABEL[label];
}

export function colorFor(label: string, index: number): string {
  return basketColor(label) ?? SERIES_COLORS[index % SERIES_COLORS.length];
}
