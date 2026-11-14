/**
 * The Account tab (bank-app style overview): balance, money in/out this month, balance
 * history and the transaction list. SERVER ONLY. Every number comes from the customer's
 * own transactions, like everything else in lib/data.
 */
import type { AccountSummary, AccountTransaction, DateRange, Transaction, TransactionSearch } from "@/lib/types";
import {
  categoryKind,
  getDataToday,
  getTransactions,
  isIncome,
  isSpending,
  merchantType,
  periodToRange,
  round2,
  spentEur,
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

// ─── Search (Activity + Home's recent transactions) ──────────────────────

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LIMIT = 200;

export type TransactionQuery = {
  /** "YYYY-MM" or "latest" (the newest month with data): sets from / to to that whole month. */
  month?: string;
  q?: string;
  category?: string;
  type?: string; // "income" | "expense" | anything else = all
  from?: string;
  to?: string;
  sort?: string; // "oldest" | anything else = newest
  offset?: number;
  limit?: number;
};

/**
 * The customer's transactions, filtered and sorted. Same rows as the Account summary
 * (AccountTransaction) and the same income / spending rules as everywhere else in lib/data.
 * WHY on the server: two years can be 1 500+ transactions; the phone gets one page.
 */
export function searchTransactions(query: TransactionQuery): TransactionSearch {
  const all = getTransactions(); // oldest first
  const dataRange: DateRange | null = all.length ? { from: all[0].date, to: all[all.length - 1].date } : null;
  const asOf = getDataToday();
  // WHY clamp: a month from another customer's history (or a typo) falls back to the latest.
  const latestMonth = (dataRange?.to ?? asOf).slice(0, 7);
  const firstMonth = (dataRange?.from ?? asOf).slice(0, 7);
  const month =
    query.month === "latest" || (query.month && (query.month < firstMonth || query.month > latestMonth))
      ? latestMonth
      : query.month;
  const byMonth = month && /^\d{4}-\d{2}$/.test(month) ? { from: `${month}-01`, to: endOfMonth(`${month}-01`) } : null;
  const from = byMonth?.from ?? (query.from && ISO_DAY.test(query.from) ? query.from : (dataRange?.from ?? asOf));
  const to = byMonth?.to ?? (query.to && ISO_DAY.test(query.to) ? query.to : (dataRange?.to ?? asOf));
  const range = from <= to ? { from, to } : { from: to, to: from };

  const inDates = all.filter((t) => t.date >= range.from && t.date <= range.to);
  const byCategory = new Map<string, number>();
  for (const t of inDates) byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + 1);

  // WHY these meanings: "income" and "expense" are the same as the In / Out numbers on Home;
  // moves to the customer's own savings are neither, so they only show under "all".
  const typeOk =
    query.type === "income" ? isIncome : query.type === "expense" ? isSpending : () => true;
  const q = (query.q ?? "").trim().toLowerCase();
  const matches = inDates.filter(
    (t) =>
      typeOk(t) &&
      (!query.category || t.category === query.category) &&
      (!q || `${merchantType(t.mccCode) ?? ""} ${t.category}`.toLowerCase().includes(q)),
  );

  const ordered = query.sort === "oldest" ? matches : [...matches].reverse();
  const offset = Math.max(0, Math.floor(query.offset ?? 0));
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(query.limit ?? 50)));
  const page = ordered.slice(offset, offset + limit);

  return {
    range,
    dataRange,
    asOf,
    categories: [...byCategory]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    count: matches.length,
    incomeEur: round2(matches.filter(isIncome).reduce((sum, t) => sum + t.amountEur, 0)),
    spendingEur: round2(matches.filter(isSpending).reduce((sum, t) => sum + spentEur(t), 0)),
    transactions: page.map(toRow),
    nextOffset: offset + limit < ordered.length ? offset + limit : null,
  };
}
