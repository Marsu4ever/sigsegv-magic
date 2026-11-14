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
import type { ChartRow, SafeDay, SafeToSpendSummary } from "@/lib/types";
import { addDays, toDate } from "@/lib/data/dates";
import { getDataToday, getTransactions, round2 } from "@/lib/data";
import { irregularBuffer } from "./irregular";
import { upcomingPayments } from "./recurring";

function daysBetween(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);
}

/** WHY 30 without a payday: a month is the usual pay cycle. The UI says it's an assumption. */
const NO_PAYDAY_DAYS = 30;

/**
 * null when the customer has no transactions (no balance to start from — nothing is made up).
 * WHY every step is rounded before the next one: the breakdown on Home shows each line, and
 * they must add up to the cent (balance − fixed − reserve = left; per day × days = the total).
 */
export function safeToSpend(days = 7): (SafeToSpendSummary & { rows: ChartRow[] }) | null {
  const today = getDataToday();
  const txs = getTransactions();
  const latest = txs.at(-1);
  if (!latest) return null;
  const balance = round2(latest.balanceAfterEur);

  // Next payday from the salary rhythm (needs 2+ salaries to know the gap).
  const salaries = txs.filter((t) => t.category === "Salary" && t.amountEur > 0).map((t) => t.date);
  let nextPayday: string | null = null;
  if (salaries.length >= 2) {
    const gaps = salaries.slice(1).map((d, i) => daysBetween(salaries[i], d));
    const usualGap = Math.max(7, [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]);
    nextPayday = addDays(salaries[salaries.length - 1], usualGap);
    while (nextPayday <= today) nextPayday = addDays(nextPayday, usualGap);
  }
  const daysToPayday = nextPayday ? daysBetween(today, nextPayday) : NO_PAYDAY_DAYS;

  // Bills, subscriptions and savings expected up to and including payday (same list as Home's
  // "Upcoming payments"). WHY including payday: if rent is due that day, be on the safe side.
  const fixedCosts = upcomingPayments(daysToPayday);
  const fixed = round2(fixedCosts.reduce((sum, p) => sum + p.amountEur, 0));
  const surpriseAvgPerMonth = round2(irregularBuffer().averagePerMonthEur);
  const reserve = round2((surpriseAvgPerMonth * daysToPayday) / 30);

  const left = round2(balance - fixed - reserve); // can be negative: then it's a shortfall
  const safeUntilPayday = Math.max(0, left);
  const shortfall = Math.max(0, round2(-left));
  const perDay = round2(safeUntilPayday / Math.max(1, daysToPayday));
  // WHY only the days before payday: after payday there's new money we can't know yet, so
  // "the next 7 days" never promises more than what's there until payday.
  const coveredDays = Math.min(days, daysToPayday);
  const forDays = round2(perDay * coveredDays);

  // Day by day: today first. After payday the day has no allowance (a new budget starts).
  const soon = upcomingPayments(days);
  const plan: SafeDay[] = Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i);
    return {
      date,
      allowanceEur: i < coveredDays ? perDay : null,
      isPayday: date === nextPayday,
      payments: soon.filter((p) => p.date === date),
    };
  });

  const rows: ChartRow[] = [
    { label: "Balance today", value: balance },
    { label: "Fixed costs before payday", value: -fixed },
    { label: "Surprise reserve before payday", value: -reserve },
    { label: "Safe until payday", value: safeUntilPayday },
    { label: `Safe for the next ${coveredDays} days`, value: forDays },
  ];
  return {
    today,
    nextPayday,
    daysToPayday,
    balanceEur: balance,
    fixedCosts,
    fixedCostsBeforePaydayEur: fixed,
    surpriseAvgPerMonthEur: surpriseAvgPerMonth,
    surpriseBufferEur: reserve,
    leftAfterCostsEur: left,
    safeUntilPaydayEur: safeUntilPayday,
    shortfallEur: shortfall,
    safePerDayEur: perDay,
    requestedDays: days,
    coveredDays,
    safeForRequestedDaysEur: forDays,
    plan,
    rows,
  };
}
