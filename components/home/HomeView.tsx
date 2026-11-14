"use client";
/**
 * Home tab — one calm dashboard that replaces the old Account and This week tabs.
 * Owner: UI person.
 *
 * Sections, top to bottom (the order a bank customer asks in: "how much do I have, how much
 * can I spend, anything I should know, where did it go, what's coming, what just happened"):
 *   1. account overview      → /api/account   (balance, change since last month, income /
 *                                              expenses / net; details in a sheet)
 *   2. safe to spend         → /api/home      (= the coach's safe_to_spend tool; the pace bar
 *                                              also uses /api/week's last-7-days total)
 *   3. coach insights        → /api/insights  (InsightCards: one-line hooks, details on tap)
 *   4. spending breakdown    → /api/spending  (the month in the 3 baskets, expandable; the
 *                                              last 7 days are on /week)
 *   5. upcoming payments     → /api/home      (predicted from past payments, next month;
 *                                              grouped before / after payday, tap for history)
 *   6. recent transactions   → /api/transactions?limit=6 (latest, across months; all + search on /activity)
 * No numbers are made here: every amount comes from those endpoints (team rule).
 * WHY each section loads on its own (own skeleton): a slow part doesn't hold up the rest.
 * WHY 3–6 fold (CollapsibleSection): Home was too busy. Overview and safe to spend always show;
 * coach insights start open; breakdown, upcoming and recent start closed. Each choice is kept.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import type { AccountSummary, HomeExtrasResponse, TransactionSearch, WeekSummary } from "@/lib/types";
import { AccountOverview } from "./AccountOverview";
import { TransactionDayList } from "@/components/account/TransactionList";
import { InsightCards } from "@/components/insights/InsightCards";
import { SafeToSpendCard } from "./SafeToSpendCard";
import { SpendingBreakdown } from "./SpendingBreakdown";
import { UpcomingPayments } from "./UpcomingPayments";
import { DevHeaderButton } from "@/components/DevButton";
import { Icon } from "@/components/ui/Icon";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { Skeleton, SkeletonCard, SkeletonGroup, SkeletonRows } from "@/components/ui/Skeleton";

/** How many of the latest transactions Home shows (the rest: Activity). WHY 6: the spec's 5–8, compact. */
const RECENT = 6;

/** GET a JSON endpoint once; `error` holds the server's message if it fails. */
function useJson<T>(url: string): { data: T | null; error: string | null } {
  const [state, setState] = useState<{ data: T | null; error: string | null }>({ data: null, error: null });
  useEffect(() => {
    fetch(url)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.detail || json.error || `HTTP ${res.status}`);
        setState({ data: json as T, error: null });
      })
      .catch((err) => {
        console.error(`[home] ${url}`, err); // browser DevTools console
        setState({ data: null, error: err instanceof Error ? err.message : String(err) });
      });
  }, [url]);
  return state;
}

/** The small link on the right of a section title ("See all ›"). */
function SectionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="flex items-center text-xs font-medium text-accent">
      {label}
      <Icon name="chevron" size={14} />
    </Link>
  );
}

function SectionError({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 rounded-2xl bg-danger-soft p-4 text-sm text-danger">
      <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
      <span>Couldn&apos;t load this part. {text}</span>
    </p>
  );
}

export function HomeView() {
  const account = useJson<AccountSummary>("/api/account");
  const extras = useJson<HomeExtrasResponse>("/api/home");
  const week = useJson<WeekSummary>("/api/week");
  // WHY its own request: the latest few across months (on the 1st, "this month" has almost none).
  const recent = useJson<TransactionSearch>(`/api/transactions?limit=${RECENT}`);

  return (
    <div className="h-full overflow-y-auto">
      <header className="flex items-center justify-between gap-2 border-b border-line bg-surface px-4 py-3">
        <h1 className="font-semibold">Home</h1>
        <DevHeaderButton />
      </header>

      <div className="space-y-6 p-4 pb-8">
        {/* 1. Account overview */}
        {account.error ? (
          <SectionError text={account.error} />
        ) : account.data ? (
          <AccountOverview data={account.data} />
        ) : (
          <SkeletonGroup className="space-y-3">
            <div className="space-y-3 rounded-2xl bg-surface p-5 shadow-sm">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-9 w-1/2" />
              <Skeleton className="h-3 w-2/5" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SkeletonCard lines={1} />
              <SkeletonCard lines={1} />
            </div>
            <Skeleton className="h-14 rounded-2xl" />
          </SkeletonGroup>
        )}

        {/* 2. Safe to spend */}
        {extras.error ? (
          <SectionError text={extras.error} />
        ) : extras.data ? (
          extras.data.safeToSpend ? (
            <SafeToSpendCard s={extras.data.safeToSpend} weekSpentEur={week.data?.totalSpentEur ?? null} />
          ) : (
            // No transactions: nothing to base it on, so no number at all.
            <p className="rounded-2xl bg-surface p-4 text-sm text-muted shadow-sm">
              Safe to spend needs some account history first.
            </p>
          )
        ) : (
          <SkeletonGroup>
            <SkeletonCard lines={3} />
          </SkeletonGroup>
        )}

        {/* 3. Coach insights (hides itself when there's nothing to say) */}
        <InsightCards title="Coach insights" />

        {/* 4. Spending breakdown: the month in the 3 baskets (the 7-day view is one tap away) */}
        <CollapsibleSection
          id="spending"
          title="Spending breakdown"
          defaultOpen={false}
          aside={<SectionLink href="/week" label="Last 7 days" />}
        >
          <SpendingBreakdown />
        </CollapsibleSection>

        {/* 5. Upcoming payments */}
        <CollapsibleSection id="upcoming" title="Upcoming payments" defaultOpen={false}>
          {extras.error ? (
            <SectionError text={extras.error} />
          ) : extras.data ? (
            <UpcomingPayments
              items={extras.data.upcoming}
              nextPayday={extras.data.safeToSpend?.nextPayday ?? null}
              beforePaydayEur={extras.data.safeToSpend?.fixedCostsBeforePaydayEur}
              totalEur={extras.data.upcomingTotalEur}
            />
          ) : (
            <SkeletonGroup className="overflow-hidden rounded-2xl bg-surface shadow-sm">
              <SkeletonRows rows={3} />
            </SkeletonGroup>
          )}
        </CollapsibleSection>

        {/* 6. Recent transactions */}
        <CollapsibleSection
          id="recent"
          title="Recent transactions"
          defaultOpen={false}
          aside={<SectionLink href="/activity" label="See all" />}
        >
          {recent.error ? (
            <SectionError text={recent.error} />
          ) : recent.data ? (
            <div className="overflow-hidden rounded-2xl bg-surface shadow-sm">
              {recent.data.transactions.length > 0 ? (
                <TransactionDayList txs={recent.data.transactions} today={recent.data.asOf} />
              ) : (
                <p className="p-4 text-sm text-muted">No transactions yet.</p>
              )}
            </div>
          ) : (
            <SkeletonGroup className="overflow-hidden rounded-2xl bg-surface shadow-sm">
              <SkeletonRows rows={RECENT} />
            </SkeletonGroup>
          )}
        </CollapsibleSection>
      </div>
    </div>
  );
}
