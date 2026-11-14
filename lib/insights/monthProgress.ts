/**
 * month_progress — "How am I doing this month?" Owner: INSIGHTS person.
 *
 * Running total of spending per day of the month, compared with last month,
 * plus a projection to the end of the month.
 *
 * PROJECTION (simple + explainable):
 *   spent so far
 *   + remaining days × average daily VARIABLE spending (last 90 days, without
 *     fixed bills)
 *   + fixed bills not paid yet this month (rent/utilities: last month's amount
 *     minus what's been paid so far), added on the day they were paid last month
 *
 * WHY split fixed vs variable: rent hits once a month; spreading it over the
 * days would make the projection jump around.
 */
import type { ChartRow } from "@/lib/types";
import {
  getDataToday,
  getTransactions,
  isSpending,
  merchantType,
  round2,
  spentEur,
} from "@/lib/data";
import { addDays, endOfMonth, startOfMonth } from "@/lib/data/dates";
import type { Transaction } from "@/lib/types";

const isFixedBill = (t: Transaction) => /housing|utilities/i.test(t.transactionType);
const day = (date: string) => Number(date.slice(8, 10));

function median(xs: number[]): number {
  const v = [...xs].sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)] ?? 0;
}

/** Running totals per day of month: index 0 = day 1. */
function cumulativeByDay(txs: Transaction[], days: number): number[] {
  const perDay = new Array(days).fill(0);
  for (const t of txs) if (isSpending(t)) perDay[day(t.date) - 1] += spentEur(t);
  let sum = 0;
  return perDay.map((v) => (sum += v));
}

export function monthProgress(month?: string) {
  const today = getDataToday();
  const thisMonth = month && /^\d{4}-\d{2}$/.test(month) ? month : today.slice(0, 7);
  const first = `${thisMonth}-01`;
  const last = endOfMonth(first);
  const daysInMonth = day(last);
  // A past month is complete; the current month runs up to "today" in the data.
  const daysElapsed = last <= today ? daysInMonth : Math.max(0, day(today));
  const asOf = last <= today ? last : today;

  const prevFirst = startOfMonth(addDays(first, -1));
  const prevLast = endOfMonth(prevFirst);
  const prevDays = day(prevLast);

  const thisTx = getTransactions({ from: first, to: asOf });
  const prevTx = getTransactions({ from: prevFirst, to: prevLast });
  const actual = cumulativeByDay(thisTx, daysElapsed);
  const prev = cumulativeByDay(prevTx, prevDays);
  const soFar = actual[daysElapsed - 1] ?? 0;

  // ── Projection ──
  const recent = getTransactions({ from: addDays(asOf, -89), to: asOf });
  const variablePerDay =
    recent.filter((t) => isSpending(t) && !isFixedBill(t)).reduce((s, t) => s + spentEur(t), 0) /
    90;
  // Fixed bills still due this month, per category, on last month's usual day.
  const fixedDue: { category: string; amount: number; onDay: number }[] = [];
  if (daysElapsed < daysInMonth) {
    const cats = new Set(
      prevTx.filter((t) => isSpending(t) && isFixedBill(t)).map((t) => t.category),
    );
    for (const category of cats) {
      const lastMonthTx = prevTx.filter(
        (t) => isSpending(t) && isFixedBill(t) && t.category === category,
      );
      const lastMonthAmount = lastMonthTx.reduce((s, t) => s + spentEur(t), 0);
      const paid = thisTx
        .filter((t) => isSpending(t) && isFixedBill(t) && t.category === category)
        .reduce((s, t) => s + spentEur(t), 0);
      const due = lastMonthAmount - paid;
      if (due > 0.5) {
        const usual = median(lastMonthTx.map((t) => day(t.date)));
        fixedDue.push({
          category,
          amount: due,
          onDay: Math.min(daysInMonth, Math.max(daysElapsed + 1, usual)),
        });
      }
    }
  }

  const rows: ChartRow[] = [];
  let projected = soFar;
  for (let d = 1; d <= Math.max(daysInMonth, prevDays); d++) {
    const row: ChartRow = { label: String(d), value: 0 };
    if (d <= daysElapsed) {
      row.value = round2(actual[d - 1]);
    } else if (d <= daysInMonth) {
      projected +=
        variablePerDay + fixedDue.filter((f) => f.onDay === d).reduce((s, f) => s + f.amount, 0);
      row.value = round2(projected);
      row.projected = true;
    } else {
      row.value = NaN; // this month has no such day (e.g. 31st) — renderer hides it
    }
    if (d <= prevDays) row.value2 = round2(prev[d - 1]);
    rows.push(row);
  }
  const projectedTotal = daysElapsed < daysInMonth ? projected : soFar;
  const lastMonthTotal = prev[prevDays - 1] ?? 0;
  const lastMonthByNow = prev[Math.min(daysElapsed, prevDays) - 1] ?? 0;

  // Biggest expenses this month (shown under the chart, tap for more).
  const biggestExpenses = thisTx
    .filter(isSpending)
    .sort((a, b) => spentEur(b) - spentEur(a))
    .slice(0, 20)
    .map((t) => ({
      label: merchantType(t.mccCode) ?? t.category,
      sub: `${t.category} · ${day(t.date)}.${Number(t.date.slice(5, 7))}.`,
      value: round2(spentEur(t)),
    }));

  return {
    month: thisMonth,
    previousMonth: prevFirst.slice(0, 7),
    asOf,
    daysElapsed,
    daysInMonth,
    spentSoFarEur: round2(soFar),
    lastMonthBySameDayEur: round2(lastMonthByNow),
    differenceVsLastMonthSoFarEur: round2(soFar - lastMonthByNow),
    projectedMonthTotalEur: round2(projectedTotal),
    lastMonthTotalEur: round2(lastMonthTotal),
    projection: {
      variablePerDayEur: round2(variablePerDay),
      fixedBillsStillDue: fixedDue.map((f) => ({ ...f, amount: round2(f.amount) })),
    },
    rows,
    seriesNames: ["This month", "Last month"] as [string, string],
    facts: [
      { label: "Spent so far", value: round2(soFar) },
      { label: "Projected month total", value: round2(projectedTotal) },
      { label: "Last month by this day", value: round2(lastMonthByNow) },
      { label: "Last month total", value: round2(lastMonthTotal) },
    ],
    biggestExpenses,
  };
}
