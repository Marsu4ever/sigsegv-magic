/**
 * The Account tab (bank-app style overview): balance, money in/out this month, balance
 * history and the transaction list. SERVER ONLY. Every number comes from the customer's
 * own transactions, like everything else in lib/data.
 */
import type { AccountSummary, AccountTransaction, Transaction } from "@/lib/types";
import {
  categoryKind,
  getDataToday,
  getTransactions,
  merchantType,
  periodToRange,
  round2,
} from "./index";
import { balanceOverTime, incomeSummary } from "./money";
import { addDays, endOfMonth } from "./dates";

/** "05OCT24:17:51:20" (the dataset's timestamp) → "17:51". */
function timeOf(timestamp: string): string {
  return timestamp.match(/:(\d{2}:\d{2}):\d{2}$/)?.[1] ?? "";
}

function toRow(t: Transaction): AccountTransaction {
  return {
    date: t.date,
    time: timeOf(t.timestamp),
    category: t.category,
    merchantType: merchantType(t.mccCode) ?? null,
    amountEur: t.amountEur,
    kind: categoryKind(t.category),
  };
}

/** Everything the Account tab shows. `month` ("YYYY-MM") picks the transaction list's month. */
export function getAccountSummary(month?: string): AccountSummary {
  const txs = getTransactions(); // oldest first
  const latest = txs.at(-1);
  const thisMonthRange = periodToRange("this_month");
  const thisMonth = incomeSummary(thisMonthRange);
  // Balance at the end of last month = the balance after the last transaction before this
  // month (txs are oldest first). WHY not a date lookup: the balance only changes with a transaction.
  const beforeThisMonth = txs.filter((t) => t.date < thisMonthRange.from).at(-1);
  const history = balanceOverTime(periodToRange("last_90_days"));

  // WHY whole months with ‹ › arrows (not endless "Show more"): easy to go back and
  // forth, and each month has its own total — simpler to follow on a phone.
  const first = txs[0]?.date.slice(0, 7) ?? getDataToday().slice(0, 7);
  const last = latest?.date.slice(0, 7) ?? first;
  const shown = month && /^\d{4}-\d{2}$/.test(month) && month >= first && month <= last ? month : last;
  const range = { from: `${shown}-01`, to: endOfMonth(`${shown}-01`) };
  const inOut = incomeSummary(range);

  return {
    // WHY null, not "" / 0: with no transactions there is no balance to show (no placeholders).
    accountId: latest?.accountId ?? null,
    balanceEur: latest ? latest.balanceAfterEur : null,
    asOf: getDataToday(),
    month: {
      range: thisMonth.range,
      incomeEur: thisMonth.incomeEur,
      spendingEur: thisMonth.spendingEur,
      netEur: thisMonth.keptEur, // income − spending
      movedToSavingsEur: thisMonth.movedToSavingsEur,
    },
    previousMonth:
      latest && beforeThisMonth
        ? {
            endDate: addDays(thisMonthRange.from, -1),
            balanceEur: beforeThisMonth.balanceAfterEur,
            changeEur: round2(latest.balanceAfterEur - beforeThisMonth.balanceAfterEur),
          }
        : null,
    balanceHistory: history.rows,
    lowest: history.lowest,
    list: { month: shown, first, last, incomeEur: inOut.incomeEur, spendingEur: inOut.spendingEur },
    transactions: getTransactions(range).slice().reverse().map(toRow),
  };
}
