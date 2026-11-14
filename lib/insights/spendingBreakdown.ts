/**
 * The Spending breakdown on Home: one month of spending split into the 3 spending types
 * (Regular / Surprising expenses / Everyday spending, see BASKET_LABELS), each with its categories,
 * merchant types and purchases. Owner: INSIGHTS person. SERVER ONLY.
 *
 * WHY no new categorisation: the baskets come from lib/data/baskets.ts (each transaction's
 * `basket`) and the tree from basketTree() — the same as the coach's baskets chart. Income
 * comes from incomeSummary(), so money in / out match the Account overview.
 * WHY compare with the SAME DAYS of last month while a month is still going: 1–25 September
 * against all of August would always look like a big drop.
 */
import type { DateRange, SpendingBreakdown } from "@/lib/types";
import { getDataToday, getTransactions, round2 } from "@/lib/data";
import { incomeSummary } from "@/lib/data/money";
import { endOfMonth } from "@/lib/data/dates";
import { basketTree } from "./basketTree";

/** "2026-09" − 1 → "2026-08". */
function prevMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const i = y * 12 + (m - 1) - 1;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

/** Whole-number % change, or null when there's no base to compare with. */
const change = (now: number, before: number | null) =>
  before && before > 0 ? Math.round((now / before - 1) * 100) : null;

export function spendingBreakdown(month?: string): SpendingBreakdown {
  const txs = getTransactions(); // oldest first
  const today = getDataToday();
  const first = txs[0]?.date.slice(0, 7) ?? today.slice(0, 7);
  const last = txs.at(-1)?.date.slice(0, 7) ?? first;
  const shown = month && /^\d{4}-\d{2}$/.test(month) && month >= first && month <= last ? month : last;

  const monthEnd = endOfMonth(`${shown}-01`);
  const range: DateRange = { from: `${shown}-01`, to: monthEnd < today ? monthEnd : today };
  const inProgress = range.to < monthEnd;

  const tree = basketTree(range);
  const inOut = incomeSummary(range);

  // The comparison period: the same days of the month before (capped at its length).
  const pm = prevMonth(shown);
  const pmEnd = endOfMonth(`${pm}-01`);
  const day = range.to.slice(8, 10);
  const prevRange: DateRange = {
    from: `${pm}-01`,
    to: inProgress && `${pm}-${day}` < pmEnd ? `${pm}-${day}` : pmEnd,
  };
  const hasPrev = pm >= first;
  const prevTree = hasPrev ? basketTree(prevRange) : null;

  const baskets = tree.baskets.map((b) => {
    const prevTotal = prevTree?.baskets.find((p) => p.basket === b.basket)?.total ?? null;
    return {
      ...b,
      count: b.categories.reduce((n, c) => n + c.count, 0),
      share: tree.total ? round2(b.total / tree.total) : 0,
      previousTotal: prevTotal,
      changePct: change(b.total, prevTotal),
    };
  });

  return {
    month: shown,
    first,
    last,
    range,
    inProgress,
    incomeEur: inOut.incomeEur,
    spendingEur: tree.total,
    count: baskets.reduce((n, b) => n + b.count, 0),
    baskets,
    previous: prevTree
      ? { range: prevRange, spendingEur: prevTree.total, changePct: change(tree.total, prevTree.total) }
      : null,
  };
}
