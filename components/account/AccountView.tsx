"use client";
/**
 * "Account" tab — the bank-app overview: balance, money in/out this month, balance
 * history, a shortcut to the coach, and every transaction (newest first, "Show more").
 * Data: GET /api/account (lib/data/home.ts). No AI involved. Owner: UI person.
 *
 * WHY no Pay / Transfer buttons: this is a demo on read-only data; buttons that do
 * nothing would look broken in front of judges.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import type { AccountSummary, AccountTransaction } from "@/lib/types";
import { CategoryTile } from "@/components/charts/categoryIcons";
import { BalanceChart } from "./BalanceChart";
import { InsightCards } from "@/components/insights/InsightCards";
import { fiDate, formatValue, weekdayDate } from "@/components/charts/format";
import { DevHeaderButton } from "@/components/DevButton";
import { Icon } from "@/components/ui/Icon";

/** "2026-10-01" → "2026-09-30". WHY local: lib/data is server-only by team rule. */
function previousDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

const eur = (n: number) => formatValue(n, "€");

/** Questions that open the chat with the coach already asking (see ChatView ?ask=). */
const COACH_QUESTIONS = [
  "Where did my money go this month?",
  "What's safe for me to spend this week?",
  "How could I save more?",
];

/** "2026-09-01" → "September" (the month the in/out tiles cover). */
function monthName(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
}

/** Day heading in the list. "Today" = the latest day in the data, as everywhere in the app. */
function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === previousDay(today)) return "Yesterday";
  return weekdayDate(date, date.slice(0, 4) !== today.slice(0, 4));
}

function groupByDay(txs: AccountTransaction[]): { date: string; items: AccountTransaction[] }[] {
  const groups: { date: string; items: AccountTransaction[] }[] = [];
  for (const t of txs) {
    const last = groups.at(-1);
    if (last && last.date === t.date) last.items.push(t);
    else groups.push({ date: t.date, items: [t] });
  }
  return groups;
}

function TransactionRow({ t }: { t: AccountTransaction }) {
  const title = t.merchantType ?? t.category;
  const sub = [t.merchantType ? t.category : null, t.kind === "savings_move" ? "to savings" : null, t.time]
    .filter(Boolean)
    .join(" · ");
  // WHY these colours: like a bank statement — money in green, spending plain,
  // moves to your own savings greyed out (it isn't spending).
  const amountClass =
    t.kind === "income"
      ? "font-semibold text-money-in"
      : t.kind === "savings_move"
        ? "text-muted"
        : "text-foreground";
  return (
    <li className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
      {t.kind === "spending" ? (
        <CategoryTile category={t.category} size={36} />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Icon name={t.kind === "income" ? "coins" : "piggy"} size={18} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        {sub && <p className="truncate text-xs text-muted">{sub}</p>}
      </div>
      <span className={`shrink-0 text-sm tabular-nums ${amountClass}`}>
        {t.amountEur > 0 ? "+" : ""}
        {eur(t.amountEur)}
      </span>
    </li>
  );
}

export function AccountView() {
  const [data, setData] = useState<AccountSummary | null>(null);
  const [txs, setTxs] = useState<AccountTransaction[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(offset: number): Promise<AccountSummary> {
    const res = await fetch(`/api/account?offset=${offset}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.detail || json.error || `HTTP ${res.status}`);
    return json as AccountSummary;
  }

  useEffect(() => {
    load(0)
      .then((d) => {
        setData(d);
        setTxs(d.transactions);
        setNextOffset(d.nextOffset);
      })
      .catch((err) => setError(String(err.message ?? err)));
  }, []);

  async function showMore() {
    if (nextOffset === null) return;
    setLoadingMore(true);
    try {
      const d = await load(nextOffset);
      setTxs((t) => [...t, ...d.transactions]);
      setNextOffset(d.nextOffset);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <header className="flex items-center justify-between gap-2 border-b border-line bg-surface px-4 py-3">
        <h1 className="font-semibold">Account</h1>
        <DevHeaderButton />
      </header>

      <div className="space-y-4 p-4">
        {error && <p className="text-sm text-danger">⚠️ {error}</p>}
        {!data && !error && <p className="text-sm text-muted">Loading…</p>}

        {data && (
          <>
            {/* Balance */}
            <section className="rounded-2xl bg-accent p-5 text-accent-foreground shadow-sm">
              <p className="text-sm font-medium opacity-90">Current account</p>
              <p className="text-xs opacity-75">{data.accountId}</p>
              <p className="mt-4 text-4xl font-bold tabular-nums">{eur(data.balanceEur)}</p>
              <p className="mt-1 text-xs opacity-80">Balance on {fiDate(data.asOf)}</p>
            </section>

            {/* This month in / out */}
            <div className="grid grid-cols-2 gap-3">
              <section className="rounded-xl bg-surface p-4 shadow-sm">
                <p className="text-xs text-muted">In · {monthName(data.month.range.from)}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-money-in">
                  +{eur(data.month.incomeEur)}
                </p>
              </section>
              <section className="rounded-xl bg-surface p-4 shadow-sm">
                <p className="text-xs text-muted">Out · {monthName(data.month.range.from)}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-money-out">
                  {eur(-data.month.spendingEur)}
                </p>
              </section>
            </div>

            {/* What the coach noticed without being asked */}
            <InsightCards />

            {/* Balance history */}
            {data.balanceHistory.length > 1 && (
              <section className="rounded-xl bg-surface p-4 shadow-sm">
                <h2 className="text-sm font-semibold">Balance, last 90 days</h2>
                {data.lowest && (
                  <p className="text-xs text-muted">
                    Lowest: {eur(data.lowest.balanceEur)} on {fiDate(data.lowest.date)}
                  </p>
                )}
                <div className="mt-2">
                  <BalanceChart rows={data.balanceHistory} />
                </div>
              </section>
            )}

            {/* Shortcut to the coach */}
            <section className="rounded-xl bg-surface p-4 shadow-sm">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <span className="text-accent">
                  <Icon name="sparkles" size={18} />
                </span>
                Ask Money Coach
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {COACH_QUESTIONS.map((q) => (
                  <Link
                    key={q}
                    href={`/chat?ask=${encodeURIComponent(q)}`}
                    className="rounded-full border border-line bg-background px-3 py-1.5 text-sm"
                  >
                    {q}
                  </Link>
                ))}
              </div>
            </section>

            {/* Transactions */}
            <section className="overflow-hidden rounded-xl bg-surface shadow-sm">
              <h2 className="px-4 pb-2 pt-4 text-sm font-semibold">Transactions</h2>
              {groupByDay(txs).map((g) => (
                <div key={g.date}>
                  <p className="bg-background px-4 py-1.5 text-xs font-medium text-muted">
                    {dayLabel(g.date, data.asOf)}
                  </p>
                  <ul>
                    {g.items.map((t, i) => (
                      <TransactionRow key={`${t.date}-${t.time}-${i}`} t={t} />
                    ))}
                  </ul>
                </div>
              ))}
              {txs.length === 0 && <p className="px-4 pb-4 text-sm text-muted">No transactions.</p>}
              {nextOffset !== null && (
                <button
                  type="button"
                  onClick={showMore}
                  disabled={loadingMore}
                  className="w-full border-t border-line py-3 text-sm font-medium text-accent disabled:opacity-50"
                >
                  {loadingMore ? "Loading…" : "Show more"}
                </button>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
