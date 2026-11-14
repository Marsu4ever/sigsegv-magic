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
 *   6. recent transactions   → /api/account   (latest few; everything on /activity)
 * No numbers are made here: every amount comes from those endpoints (team rule).
 * WHY each section loads on its own (own skeleton): a slow part doesn't hold up the rest.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import type { AccountSummary, HomeExtrasResponse, WeekSummary } from "@/lib/types";
import { AccountOverview } from "./AccountOverview";
import { TransactionDayList } from "@/components/account/TransactionList";
import { InsightCards } from "@/components/insights/InsightCards";
import { SafeToSpendCard } from "./SafeToSpendCard";
import { SpendingBreakdown } from "./SpendingBreakdown";
import { UpcomingPayments } from "./UpcomingPayments";
import { DevHeaderButton } from "@/components/DevButton";
import { Icon } from "@/components/ui/Icon";
import { Skeleton, SkeletonCard, SkeletonGroup, SkeletonRows } from "@/components/ui/Skeleton";

/** How many of the latest transactions Home shows (the rest: Activity). */
const RECENT = 5;

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

/** A titled block of the dashboard, with an optional link on the right ("See all"). */
function Section({
  title,
  link,
  children,
}: {
  title: string;
  link?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        {link && (
          <Link href={link.href} className="flex items-center text-xs font-medium text-accent">
            {link.label}
            <Icon name="chevron" size={14} />
          </Link>
        )}
      </div>
      {children}
    </section>
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
        <Section title="Spending breakdown" link={{ href: "/week", label: "Last 7 days" }}>
          <SpendingBreakdown />
        </Section>

        {/* 5. Upcoming payments */}
        <Section title="Upcoming payments">
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
        </Section>

        {/* 6. Recent transactions */}
        <Section title="Recent transactions" link={{ href: "/activity", label: "See all" }}>
          {account.error ? (
            <SectionError text={account.error} />
          ) : account.data ? (
            <div className="overflow-hidden rounded-2xl bg-surface shadow-sm">
              {account.data.transactions.length > 0 ? (
                <TransactionDayList txs={account.data.transactions.slice(0, RECENT)} today={account.data.asOf} />
              ) : (
                <p className="p-4 text-sm text-muted">No transactions yet this month.</p>
              )}
            </div>
          ) : (
            <SkeletonGroup className="overflow-hidden rounded-2xl bg-surface shadow-sm">
              <SkeletonRows rows={RECENT} />
            </SkeletonGroup>
          )}
        </Section>
      </div>
    </div>
  );
}
