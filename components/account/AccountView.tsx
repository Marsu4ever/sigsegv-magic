"use client";
/**
 * "Account" tab — the bank-app overview. Data: GET /api/account (lib/data/home.ts).
 * No AI involved. Owner: UI person.
 *
 * WHY this order (built for a quick glance — "explain it to an 18-year-old"):
 * balance first, then one-line "For you" hooks, this month in/out, then purchases one
 * month at a time (‹ › or swipe). Details hide behind a tap: the balance chart behind
 * "History", each insight behind its hook (components/insights/InsightCards.tsx).
 *
 * WHY no Pay / Transfer buttons: this is a demo on read-only data; buttons that do
 * nothing would look broken in front of judges.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AccountSummary, AccountTransaction } from "@/lib/types";
import { CategoryTile } from "@/components/charts/categoryIcons";
import { BalanceChart } from "./BalanceChart";
import { InsightCards } from "@/components/insights/InsightCards";
import { fiDate, formatValue, weekdayDate } from "@/components/charts/format";
import { DevHeaderButton } from "@/components/DevButton";
import { Icon } from "@/components/ui/Icon";
import { Skeleton, SkeletonGroup, SkeletonRows } from "@/components/ui/Skeleton";

/** "2026-10-01" → "2026-09-30". WHY local: lib/data is server-only by team rule. */
function previousDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

const eur = (n: number) => formatValue(n, "€");

/** "2026-09" + 1 → "2026-10" (month arithmetic for the ‹ › arrows). */
function shiftMonth(ym: string, by: number): string {
  const [y, m] = ym.split("-").map(Number);
  const i = y * 12 + (m - 1) + by;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

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

/** The Account tab's shape while it loads: balance card, in/out tiles, a month of purchases. */
function AccountSkeleton() {
  return (
    <SkeletonGroup className="space-y-4">
      <div className="space-y-3 rounded-2xl bg-surface p-5 shadow-sm">
        <Skeleton className="h-3.5 w-1/3" />
        <Skeleton className="h-9 w-1/2" />
        <Skeleton className="h-3 w-1/4" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-2 rounded-xl bg-surface p-4 shadow-sm">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-5 w-4/5" />
          </div>
        ))}
      </div>
      <div className="rounded-xl bg-surface pt-3 shadow-sm">
        <Skeleton className="mx-auto h-4 w-1/3" />
        <SkeletonRows rows={6} className="mt-2" />
      </div>
    </SkeletonGroup>
  );
}

export function AccountView() {
  const [data, setData] = useState<AccountSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);

  async function load(month?: string): Promise<AccountSummary> {
    const res = await fetch(`/api/account${month ? `?month=${month}` : ""}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.detail || json.error || `HTTP ${res.status}`);
    return json as AccountSummary;
  }

  useEffect(() => {
    load()
      .then(setData)
      .catch((err) => setError(String(err.message ?? err)));
  }, []);

  /** Previous (-1) or next (+1) month in the purchase list. */
  async function goToMonth(by: number) {
    if (!data || loadingMonth) return;
    const target = shiftMonth(data.list.month, by);
    if (target < data.list.first || target > data.list.last) return;
    setLoadingMonth(true);
    try {
      const d = await load(target);
      setData((prev) => (prev ? { ...prev, list: d.list, transactions: d.transactions } : d));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMonth(false);
    }
  }

  // WHY swipe too: sideways swipes feel natural on a phone. Mostly-vertical moves are
  // scrolling, so they're ignored.
  function onTouchStart(e: React.TouchEvent) {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) goToMonth(dx > 0 ? -1 : 1);
  }

  const list = data?.list;
  const canGoBack = !!list && list.month > list.first;
  const canGoForward = !!list && list.month < list.last;

  return (
    <div className="h-full overflow-y-auto">
      <header className="flex items-center justify-between gap-2 border-b border-line bg-surface px-4 py-3">
        <h1 className="font-semibold">Account</h1>
        <DevHeaderButton />
      </header>

      <div className="space-y-4 p-4">
        {error && <p className="text-sm text-danger">⚠️ {error}</p>}
        {!data && !error && <AccountSkeleton />}

        {data && list && (
          <>
            {/* Balance — the one number everybody looks for first */}
            <section className="rounded-2xl bg-accent p-5 text-accent-foreground shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium opacity-90">Current account</p>
                  <p className="text-xs opacity-75">{data.accountId}</p>
                </div>
                {data.balanceHistory.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setShowHistory((s) => !s)}
                    aria-expanded={showHistory}
                    className="flex items-center gap-1 rounded-full bg-accent-foreground/15 px-3 py-1 text-xs font-medium"
                  >
                    <Icon name="trend" size={14} /> {showHistory ? "Hide" : "History"}
                  </button>
                )}
              </div>
              <p className="mt-4 text-4xl font-bold tabular-nums">{eur(data.balanceEur)}</p>
              <p className="mt-1 text-xs opacity-80">Balance on {fiDate(data.asOf)}</p>
            </section>

            {/* Balance history: only when asked for */}
            {showHistory && (
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

            {/* What the coach noticed: one line each, details on tap */}
            <InsightCards />

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

            {/* Purchases, one month at a time: ‹ › or swipe */}
            <section
              className="overflow-hidden rounded-xl bg-surface shadow-sm"
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
            >
              <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-3">
                <button
                  type="button"
                  onClick={() => goToMonth(-1)}
                  disabled={!canGoBack || loadingMonth}
                  aria-label="Previous month"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-xl text-accent disabled:opacity-25"
                >
                  ‹
                </button>
                <div className="text-center">
                  <p className="text-sm font-semibold">
                    {monthName(`${list.month}-01`)} {list.month.slice(0, 4)}
                  </p>
                  <p className="text-xs text-muted tabular-nums">
                    In <span className="text-money-in">+{eur(list.incomeEur)}</span> · Out{" "}
                    {eur(-list.spendingEur)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => goToMonth(1)}
                  disabled={!canGoForward || loadingMonth}
                  aria-label="Next month"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-xl text-accent disabled:opacity-25"
                >
                  ›
                </button>
              </div>
              <div className={loadingMonth ? "opacity-50 transition-opacity" : "transition-opacity"}>
                {groupByDay(data.transactions).map((g) => (
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
                {data.transactions.length === 0 && (
                  <p className="px-4 pb-4 text-sm text-muted">No transactions this month.</p>
                )}
              </div>
            </section>

            {/* One slim way into the coach (the Chat tab is also far left) */}
            <Link href="/chat" className="flex items-center gap-3 rounded-xl bg-surface p-4 shadow-sm">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                <Icon name="chat" size={18} />
              </span>
              <span className="flex-1 text-sm font-medium">Ask Money Coach anything</span>
              <Icon name="chevron" size={16} className="text-muted" />
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
