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
} from "./index";
import { balanceOverTime, incomeSummary } from "./money";

const PAGE_SIZE = 30;

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

/** Everything the Account tab shows. `offset` pages through the transactions (newest first). */
export function getAccountSummary(offset = 0): AccountSummary {
  const txs = getTransactions(); // oldest first
  const latest = txs.at(-1);
  const thisMonth = incomeSummary(periodToRange("this_month"));
  const history = balanceOverTime(periodToRange("last_90_days"));
  const start = Math.max(0, Math.floor(offset));
  const page = txs
    .slice()
    .reverse()
    .slice(start, start + PAGE_SIZE)
    .map(toRow);
  return {
    accountId: latest?.accountId ?? "",
    balanceEur: latest?.balanceAfterEur ?? 0,
    asOf: getDataToday(),
    month: {
      range: thisMonth.range,
      incomeEur: thisMonth.incomeEur,
      spendingEur: thisMonth.spendingEur,
    },
    balanceHistory: history.rows,
    lowest: history.lowest,
    transactions: page,
    nextOffset: start + PAGE_SIZE < txs.length ? start + PAGE_SIZE : null,
  };
}
