/**
 * Date helpers. All dates are "YYYY-MM-DD" strings, handled in UTC.
 *
 * WHY strings + UTC: the dataset stores plain dates. Using UTC avoids
 * timezone bugs where a date shifts by one day depending on whose laptop
 * runs the code.
 */
import type { DateRange } from "@/lib/types";

export function toDate(s: string): Date {
  return new Date(s + "T00:00:00Z");
}

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(s: string, days: number): string {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** Monday of the week containing `s` (weeks start on Monday, as in Finland). */
export function startOfWeek(s: string): string {
  const day = toDate(s).getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(s, diff);
}

export function startOfMonth(s: string): string {
  return s.slice(0, 8) + "01";
}

export function endOfMonth(s: string): string {
  const d = toDate(startOfMonth(s));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return toIso(d);
}

export function inRange(date: string, range: DateRange): boolean {
  // WHY string comparison: "YYYY-MM-DD" strings sort the same as dates.
  return date >= range.from && date <= range.to;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function weekdayLabel(s: string): string {
  return WEEKDAYS[toDate(s).getUTCDay()];
}

/**
 * Named periods the AI (and UI) can ask for, so nobody has to do date math
 * in a prompt.
 */
export const PERIODS = [
  "last_7_days",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "last_30_days",
  "last_90_days",
  "all",
] as const;
export type Period = (typeof PERIODS)[number];

/**
 * Turn a named period into a date range, relative to `today`.
 *
 * WHY `today` is a parameter: the dataset is synthetic and its dates are not
 * the real current date. "This week" must mean the last week IN THE DATA,
 * otherwise everything would be empty. See getDataToday() in lib/data.
 */
export function resolvePeriod(period: Period, today: string, firstDate: string): DateRange {
  switch (period) {
    case "last_7_days":
      return { from: addDays(today, -6), to: today };
    case "this_week":
      return { from: startOfWeek(today), to: today };
    case "last_week": {
      const thisMonday = startOfWeek(today);
      return { from: addDays(thisMonday, -7), to: addDays(thisMonday, -1) };
    }
    case "this_month":
      return { from: startOfMonth(today), to: today };
    case "last_month": {
      const lastMonthDay = addDays(startOfMonth(today), -1);
      return { from: startOfMonth(lastMonthDay), to: endOfMonth(lastMonthDay) };
    }
    case "last_30_days":
      return { from: addDays(today, -29), to: today };
    case "last_90_days":
      return { from: addDays(today, -89), to: today };
    case "all":
      return { from: firstDate, to: today };
  }
}
