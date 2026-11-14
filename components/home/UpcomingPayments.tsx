"use client";
/**
 * "Upcoming payments" on Home: bills, subscriptions and automatic savings expected in the next
 * month. Data: UpcomingPayment[] from GET /api/home (lib/insights/recurring.ts →
 * upcomingPayments, the same recurring payments the coach's tools see). Owner: UI person.
 */
import type { UpcomingPayment } from "@/lib/types";
import { CategoryTile } from "@/components/charts/categoryIcons";
import { formatValue, weekdayDate } from "@/components/charts/format";
import { Icon } from "@/components/ui/Icon";

const KIND_LABEL: Record<UpcomingPayment["kind"], string> = {
  bill: "Bill",
  subscription: "Subscription",
  automatic_saving: "To savings",
};

function whenText(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/** WHY 5: enough to plan the coming weeks without turning Home into a long list. */
const SHOWN = 5;

export function UpcomingPayments({
  items,
  max = SHOWN,
  empty = "No regular bills expected in the next month.",
}: {
  items: UpcomingPayment[];
  /** How many rows at most (Home: 5; the safe-to-spend sheet shows all). */
  max?: number;
  empty?: string;
}) {
  if (items.length === 0) {
    return <p className="rounded-2xl bg-surface p-4 text-sm text-muted shadow-sm">{empty}</p>;
  }
  return (
    <ul className="overflow-hidden rounded-2xl bg-surface shadow-sm">
      {items.slice(0, max).map((p) => (
        <li key={`${p.name}-${p.date}`} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
          {p.kind === "automatic_saving" ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Icon name="piggy" size={18} />
            </span>
          ) : (
            <CategoryTile category={p.category} size={36} />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{p.name}</p>
            <p className="truncate text-xs text-muted">
              {KIND_LABEL[p.kind]} · {whenText(p.inDays)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            {/* Same colours as the transaction list: payments plain, moves to savings grey. */}
            <p className={`text-sm tabular-nums ${p.kind === "automatic_saving" ? "text-muted" : ""}`}>
              {formatValue(-p.amountEur, "€")}
            </p>
            <p className="text-[11px] text-muted">{weekdayDate(p.date)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
