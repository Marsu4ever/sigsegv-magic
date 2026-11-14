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
 * 12-MONTH AVERAGE: for each of the 12 full months before this one (only months
 * that have data), the running total by day d; then the average over those
 * months. Shorter months count their month-end total for days 29–31.
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

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const monthLabel = (m: string) => `${MONTH_NAMES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

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
  const firstMonth = (getTransactions()[0]?.date ?? today).slice(0, 7);
  const lastMonth = today.slice(0, 7);
  // Unknown or out-of-range month → the current month.
  const thisMonth =
    month && /^\d{4}-\d{2}$/.test(month) && month >= firstMonth && month <= lastMonth
      ? month
      : lastMonth;
  const isCurrent = thisMonth === lastMonth;
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

  // ── 12-month average ──
  const avgMonths: number[][] = [];
  let mFirst = first;
  for (let k = 0; k < 12; k++) {
    mFirst = startOfMonth(addDays(mFirst, -1));
    const mLast = endOfMonth(mFirst);
    const txs = getTransactions({ from: mFirst, to: mLast });
    if (txs.length > 0) avgMonths.push(cumulativeByDay(txs, day(mLast)));
  }
  const averageByDay = (d: number) =>
    avgMonths.length === 0
      ? undefined
      : avgMonths.reduce((s, cum) => s + cum[Math.min(d, cum.length) - 1], 0) / avgMonths.length;

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
    // No data for the month before (the first month of data) → no comparison line.
    if (d <= prevDays && prevTx.length > 0) row.value2 = round2(prev[d - 1]);
    const avg = averageByDay(d);
    if (avg !== undefined && d <= daysInMonth) row.average = round2(avg);
    rows.push(row);
  }
  const projectedTotal = daysElapsed < daysInMonth ? projected : soFar;
  const lastMonthTotal = prev[prevDays - 1] ?? 0;
  const lastMonthByNow = prev[Math.min(daysElapsed, prevDays) - 1] ?? 0;

  // All of this month's expenses, biggest first (shown under the chart 5 at a
  // time). WHY all, not a top 20: tapping a day highlights that day's purchases,
  // and the pie view needs every euro.
  const biggestExpenses = thisTx
    .filter(isSpending)
    .sort((a, b) => spentEur(b) - spentEur(a))
    .slice(0, 300)
    .map((t) => ({
      label: merchantType(t.mccCode) ?? t.category,
      sub: `${t.category} · ${day(t.date)}.${Number(t.date.slice(5, 7))}.`,
      value: round2(spentEur(t)),
      date: t.date.slice(0, 10),
      group: t.category,
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
    averageMonthTotalEur: round2(averageByDay(31) ?? 0),
    averageMonthsUsed: avgMonths.length,
    projection: {
      variablePerDayEur: round2(variablePerDay),
      fixedBillsStillDue: fixedDue.map((f) => ({ ...f, amount: round2(f.amount) })),
    },
    rows,
    // Past months: name the lines by month ("Aug 2026") — "this month" would be wrong.
    seriesNames: (isCurrent
      ? ["This month", "Last month"]
      : [monthLabel(thisMonth), monthLabel(prevFirst.slice(0, 7))]) as [string, string],
    monthNav: { shown: thisMonth, first: firstMonth, last: lastMonth },
    facts: [
      ...(isCurrent
        ? [
            { label: "Spent so far", value: round2(soFar) },
            { label: "Projected month total", value: round2(projectedTotal) },
          ]
        : [{ label: `Spent in ${monthLabel(thisMonth)}`, value: round2(soFar) }]),
      ...(prevTx.length > 0
        ? [
            {
              label: isCurrent ? "Last month total" : "Month before",
              value: round2(lastMonthTotal),
            },
          ]
        : []),
      ...(avgMonths.length
        ? [{ label: `Average month (last ${avgMonths.length})`, value: round2(averageByDay(31)!) }]
        : []),
    ],
    biggestExpenses,
  };
}
