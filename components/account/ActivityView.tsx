"use client";
/**
 * "Activity" tab — every transaction, one month at a time (‹ › or a sideways swipe), each
 * month with its own money in / out. Data: GET /api/account?month=YYYY-MM
 * (lib/data/home.ts). No AI involved. Owner: UI person.
 *
 * WHY its own tab: Home shows only the latest few transactions; the full history is what
 * bank apps keep under "Activity". (Was the bottom half of the old Account tab.)
 */
import { useEffect, useRef, useState } from "react";
import type { AccountSummary } from "@/lib/types";
import { TransactionDayList } from "./TransactionList";
import { formatValue, monthName } from "@/components/charts/format";
import { DevHeaderButton } from "@/components/DevButton";
import { Icon } from "@/components/ui/Icon";
import { Skeleton, SkeletonGroup, SkeletonRows } from "@/components/ui/Skeleton";

const eur = (n: number) => formatValue(n, "€");

/** "2026-09" + 1 → "2026-10" (month arithmetic for the ‹ › arrows). */
function shiftMonth(ym: string, by: number): string {
  const [y, m] = ym.split("-").map(Number);
  const i = y * 12 + (m - 1) + by;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

async function load(month?: string): Promise<AccountSummary> {
  const res = await fetch(`/api/account${month ? `?month=${month}` : ""}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.detail || json.error || `HTTP ${res.status}`);
  return json as AccountSummary;
}

export function ActivityView() {
  const [data, setData] = useState<AccountSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    load()
      .then(setData)
      .catch((err) => setError(String(err.message ?? err)));
  }, []);

  /** Previous (-1) or next (+1) month. */
  async function goToMonth(by: number) {
    if (!data || loadingMonth) return;
    const target = shiftMonth(data.list.month, by);
    if (target < data.list.first || target > data.list.last) return;
    setLoadingMonth(true);
    try {
      setData(await load(target));
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
    <div className="h-full overflow-y-auto" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header className="flex items-center justify-between gap-2 border-b border-line bg-surface px-4 py-3">
        <h1 className="font-semibold">Activity</h1>
        <DevHeaderButton />
      </header>

      <div className="space-y-4 p-4">
        {error && (
          <p className="flex items-start gap-2 text-sm text-danger">
            <Icon name="alert" size={18} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}
        {!data && !error && (
          <SkeletonGroup className="space-y-4">
            <Skeleton className="mx-auto h-5 w-1/3" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-16 rounded-2xl" />
              <Skeleton className="h-16 rounded-2xl" />
            </div>
            <div className="overflow-hidden rounded-2xl bg-surface shadow-sm">
              <SkeletonRows rows={8} />
            </div>
          </SkeletonGroup>
        )}

        {data && list && (
          <>
            {/* Month picker: ‹ September 2026 › */}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => goToMonth(-1)}
                disabled={!canGoBack || loadingMonth}
                aria-label="Previous month"
                className="flex h-11 w-11 items-center justify-center rounded-full text-accent disabled:opacity-25"
              >
                <Icon name="chevron" size={22} className="rotate-180" />
              </button>
              <p className="text-base font-semibold">
                {monthName(`${list.month}-01`)} {list.month.slice(0, 4)}
              </p>
              <button
                type="button"
                onClick={() => goToMonth(1)}
                disabled={!canGoForward || loadingMonth}
                aria-label="Next month"
                className="flex h-11 w-11 items-center justify-center rounded-full text-accent disabled:opacity-25"
              >
                <Icon name="chevron" size={22} />
              </button>
            </div>

            <div className={`space-y-4 transition-opacity ${loadingMonth ? "opacity-50" : ""}`}>
              {/* That month's money in / out */}
              <div className="grid grid-cols-2 gap-3">
                <section className="rounded-2xl bg-surface p-4 shadow-sm">
                  <p className="text-xs text-muted">Money in</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-money-in">+{eur(list.incomeEur)}</p>
                </section>
                <section className="rounded-2xl bg-surface p-4 shadow-sm">
                  <p className="text-xs text-muted">Money out</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-money-out">{eur(-list.spendingEur)}</p>
                </section>
              </div>

              <div className="overflow-hidden rounded-2xl bg-surface shadow-sm">
                {data.transactions.length > 0 ? (
                  <TransactionDayList txs={data.transactions} today={data.asOf} />
                ) : (
                  <p className="p-4 text-sm text-muted">No transactions this month.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
