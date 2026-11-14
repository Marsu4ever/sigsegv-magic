"use client";
/**
 * The target's purchases up to a tapped day — shown in the what-if view in place of the chart.
 * Owner: UI person. Data: GET /api/what-if/purchases (no AI).
 *
 * Newest first. The purchases of the tapped point (that day, or that week on the
 * 3 / 6 month charts) are highlighted. The round ← button goes back to the same point.
 * WHY the same height as the chart: the % circles and the saving below don't jump.
 */
import { useEffect, useState } from "react";
import type { SpendingTarget, TargetPurchase } from "@/lib/types";
import { formatValue, shortLabel, weekday, weekdayDate } from "@/components/charts/format";
import { SkeletonGroup, SkeletonRows } from "@/components/ui/Skeleton";

export function PurchaseList({
  target,
  from,
  date,
  today,
  highlightAfter,
  highlightLabel,
  height,
  onClose,
}: {
  target: SpendingTarget;
  /** First day of the chart's past (the lookback). */
  from: string;
  /** The tapped day. A future day → purchases up to today. */
  date: string;
  today: string;
  /** Highlight purchases after this day up to `date` (null = none). */
  highlightAfter: string | null;
  /** e.g. "on this day", "this week". */
  highlightLabel: string;
  height: number;
  onClose: () => void;
}) {
  const future = date > today;
  const to = future ? today : date;
  // WHY: the chart's first point is the day before the lookback (0 €) — nothing to fetch.
  const empty = to < from;
  const [items, setItems] = useState<TargetPurchase[] | null>(empty ? [] : null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (empty) return;
    let cancelled = false; // WHY: a quick close must not update an unmounted list
    const url =
      `/api/what-if/purchases?target=${encodeURIComponent(JSON.stringify(target))}` +
      `&from=${from}&to=${to}`;
    fetch(url)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.detail || json.error || `HTTP ${res.status}`);
        if (!cancelled) setItems(json as TargetPurchase[]);
      })
      .catch((err) => {
        console.error("[what-if/purchases]", err);
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [target, from, to, empty]);

  const isHighlighted = (p: TargetPurchase) =>
    !future && highlightAfter !== null && p.date > highlightAfter && p.date <= date;
  const total = items?.reduce((s, p) => s + p.amountEur, 0) ?? 0;
  const highlighted = items?.filter(isHighlighted).length ?? 0;

  return (
    <div className="fade-up flex flex-col" style={{ height }}>
      <div className="flex items-start justify-between gap-2 pb-2">
        <div className="min-w-0">
          {!future && <p className="text-xs text-muted">Purchases until</p>}
          <h3 className="text-lg font-semibold leading-tight">{weekdayDate(to, true)}</h3>
          {items && (
            <p className="mt-0.5 text-xs text-muted tabular-nums">
              {items.length} {items.length === 1 ? "purchase" : "purchases"} ·{" "}
              {formatValue(Math.round(total * 100) / 100, "€")}
              {highlighted > 0 && (
                <span className="text-accent">
                  {" "}
                  · {highlighted} {highlightLabel}
                </span>
              )}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to the chart"
          // WHY a round icon-only button: the arrow says enough, and it matches the ✕ above.
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
      </div>

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {error ? (
          <p className="text-sm text-danger">⚠️ {error}</p>
        ) : !items ? (
          <SkeletonGroup>
            <SkeletonRows rows={6} />
          </SkeletonGroup>
        ) : items.length === 0 ? (
          <p className="pt-6 text-center text-sm text-muted">No purchases yet by this day.</p>
        ) : (
          <ul className="space-y-1">
            {items.map((p, i) => {
              const hl = isHighlighted(p);
              return (
                <li
                  key={`${p.date}-${i}`}
                  className={`flex items-center gap-3 rounded-xl px-2 py-1.5 ${
                    hl ? "bg-accent/10 ring-1 ring-accent/50" : ""
                  }`}
                >
                  {/* Date badge: weekday over day.month. */}
                  <div className="w-11 shrink-0 rounded-lg bg-background py-1 text-center leading-tight">
                    <div className="text-[10px] uppercase text-muted">{weekday(p.date)}</div>
                    <div className="text-sm font-semibold tabular-nums">
                      {shortLabel(p.date, false)}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 truncate text-sm font-medium">{p.merchant}</div>
                  <div className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatValue(p.amountEur, "€")}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
