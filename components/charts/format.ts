/**
 * Small formatting helpers shared by charts, the Week tab and the what-if view.
 * Client-safe (no server imports).
 */

/** 1234.5, "€" → "1 234,50 €" (Finnish style). Other units: "12 kpl". */
export function formatValue(value: number, unit: string): string {
  return unit === "€"
    ? value.toLocaleString("fi-FI", { style: "currency", currency: "EUR" })
    : `${value} ${unit}`;
}

/**
 * Shorten ISO dates on axes (Finnish style):
 * daily/weekly "2026-11-03" → "3.11." · monthly "2026-11-01" → "11/26".
 * WHY: monthly data spans years, so the year must show or months repeat.
 */
export function shortLabel(label: string, monthly: boolean): string {
  const m = label.match(/^\d{2}(\d{2})-(\d{2})-(\d{2})$/);
  if (!m) return label;
  return monthly ? `${Number(m[2])}/${m[1]}` : `${Number(m[3])}.${Number(m[2])}.`;
}

/** "2026-09-23" → "23.9.2026" (Finnish style). */
export function fiDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}.${m}.${y}`;
}

/**
 * What a what-if average (WhatIf.average.months) covers: 12 → "the last 12 months",
 * 5.9 → "your 5 months of history".
 * WHY floor: 5.9 months must not read as "6 months" next to "not enough for 6 months yet".
 */
export function averageBasisText(months: number): string {
  if (months >= 12) return "the last 12 months";
  const n = Math.max(1, Math.floor(months));
  return `your ${n} month${n === 1 ? "" : "s"} of history`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-11-03" → "Tue" (English short weekday). */
export function weekday(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** "2026-11-03" → "Tue 3.11." · withYear → "Tue 3.11.2026". */
export function weekdayDate(iso: string, withYear = false): string {
  return `${weekday(iso)} ${withYear ? fiDate(iso) : shortLabel(iso, false)}`;
}
