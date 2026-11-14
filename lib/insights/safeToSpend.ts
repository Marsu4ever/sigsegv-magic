/**
 * safe_to_spend — "What is safe for me to spend this week?"
 * Owner: INSIGHTS person.
 *
 * Simple, explainable formula (all numbers shown to the user):
 *   balance today
 *   − fixed costs due before next payday          (bills + subscriptions + automatic
 *                                                 savings, each on its usual day of the
 *                                                 month: upcomingPayments)
 *   − surprise buffer before next payday          (average irregular costs per
 *                                                 month × days / 30)
 *   = safe to spend until payday  →  ÷ days = per day  →  × requested days
 *
 * Next payday = last salary + the usual gap between salaries.
 * WHY each bill on its usual day (changed 15 Nov, was "per month × days / 30"): rent due
 * next week must count in full. Spread evenly, Home showed rent coming in 6 days while
 * calling most of the balance safe to spend. The buffer is still spread evenly: surprise
 * costs have no usual day.
 */
import type { ChartRow } from "@/lib/types";
import { addDays, toDate } from "@/lib/data/dates";
import { getDataToday, getTransactions, round2 } from "@/lib/data";
import { irregularBuffer } from "./irregular";
import { upcomingPayments } from "./recurring";

function daysBetween(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);
}

export function safeToSpend(days = 7) {
  const today = getDataToday();
  const txs = getTransactions();
  const balance = txs.length ? txs[txs.length - 1].balanceAfterEur : 0;

  // Next payday from the salary rhythm.
  const salaries = txs.filter((t) => t.category === "Salary" && t.amountEur > 0).map((t) => t.date);
  let nextPayday: string | null = null;
  if (salaries.length >= 2) {
    const gaps = salaries.slice(1).map((d, i) => daysBetween(salaries[i], d));
    const usualGap = Math.max(7, [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]);
    nextPayday = addDays(salaries[salaries.length - 1], usualGap);
    while (nextPayday <= today) nextPayday = addDays(nextPayday, usualGap);
  }
  const daysToPayday = nextPayday ? daysBetween(today, nextPayday) : 30;

  // Bills, subscriptions and savings expected up to and including payday (same list as Home's
  // "Upcoming payments"). WHY including payday: if rent is due that day, be on the safe side.
  const upcomingFixed = upcomingPayments(daysToPayday).reduce((s, p) => s + p.amountEur, 0);
  const buffer = (irregularBuffer().averagePerMonthEur * daysToPayday) / 30;

  const safeUntilPayday = Math.max(0, balance - upcomingFixed - buffer);
  const perDay = safeUntilPayday / Math.max(1, daysToPayday);
  const forDays = perDay * days;

  const rows: ChartRow[] = [
    { label: "Balance today", value: round2(balance) },
    { label: `Fixed costs before payday (est.)`, value: round2(-upcomingFixed) },
    { label: `Surprise buffer before payday`, value: round2(-buffer) },
    { label: "Safe until payday", value: round2(safeUntilPayday) },
    { label: `Safe for ${days} days`, value: round2(forDays) },
  ];
  return {
    today,
    nextPayday,
    daysToPayday,
    balanceEur: round2(balance),
    fixedCostsBeforePaydayEur: round2(upcomingFixed),
    surpriseBufferEur: round2(buffer),
    safeUntilPaydayEur: round2(safeUntilPayday),
    safePerDayEur: round2(perDay),
    requestedDays: days,
    safeForRequestedDaysEur: round2(forDays),
    rows,
  };
}
