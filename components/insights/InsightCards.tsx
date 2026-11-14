"use client";
/**
 * "For you" on the Account tab: what the coach noticed without being asked
 * (GET /api/insights → lib/insights/proactive.ts). Owner: UI person.
 *
 * WHY a hook first, details on tap: the page should be readable in one glance.
 * Each tile shows ONE short line ("You could save 618 € a year"); tapping it opens a
 * sheet with the explanation, what to do, and (folded away) why it was noticed.
 * WHY calm colours: only the "you could save" number is green; the rest is plain text,
 * so nothing shouts. Colour returns inside the sheet, where there's room to explain.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Insight, InsightKind, InsightsResponse } from "@/lib/types";
import { MoneyText } from "@/components/chat/MoneyText";
import { formatValue } from "@/components/charts/format";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { BottomSheet } from "@/components/ui/BottomSheet";

const KIND: Record<InsightKind, { label: string; icon: IconName; tap: string }> = {
  save_help: { label: "Help to save", icon: "piggy", tap: "Tap to see how" },
  spending_alert: { label: "Spending alert", icon: "trend", tap: "Tap to see why" },
  unusual: { label: "Unusual activity", icon: "shield", tap: "Tap to see why" },
  recurring: { label: "Recurring payments", icon: "calendar", tap: "Tap to see them" },
};

const toneClass = (tone?: string) =>
  tone === "in" ? "text-money-in" : tone === "out" ? "text-money-out" : "";

/** The full insight, in a sheet that slides up from the bottom. */
function InsightSheet({ insight, onClose }: { insight: Insight; onClose: () => void }) {
  return (
    <BottomSheet label={KIND[insight.kind].label} title={insight.title} onClose={onClose}>
      <p className="mt-2 text-[15px] leading-snug">
        <MoneyText text={insight.detail} />
      </p>

      {insight.table && insight.table.length > 0 && (
        <table className="mt-3 w-full rounded-xl bg-surface text-sm shadow-sm">
          <tbody>
            {insight.table.map((r, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                <td className="px-3 py-2">{r.label}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${toneClass(r.tone)}`}>
                  {formatValue(r.value, "€")}
                </td>
              </tr>
            ))}
            {insight.total && (
              <tr className="border-t border-line font-semibold">
                <td className="px-3 py-2">{insight.total.label}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${toneClass(insight.table[0]?.tone)}`}>
                  {formatValue(insight.total.value, "€")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <div className="mt-3 rounded-xl bg-accent/10 p-3">
        <p className="text-xs font-semibold text-accent">Try this</p>
        <p className="mt-0.5 text-[15px] leading-snug">
          <MoneyText text={insight.action} />
        </p>
      </div>

      {/* WHY folded: most people only need the "what" and "try this"; the reasoning is there if they want it. */}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted">Why am I seeing this?</summary>
        <p className="mt-1 text-muted">
          <MoneyText text={insight.why} colors={false} />
        </p>
      </details>

      <Link
        href={`/chat?ask=${encodeURIComponent(insight.ask)}`}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3 text-sm font-semibold text-accent-foreground"
      >
        <Icon name="chat" size={18} /> Ask the coach about this
      </Link>
      {/* WHY only for "help to save": a goal turns "you keep little" into something to do
          this week (DECISIONS.md #53c). */}
      {insight.kind === "save_help" && (
        <Link
          href="/week?setup=1"
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-line py-3 text-sm font-semibold"
        >
          🎯 Set a savings goal
        </Link>
      )}
    </BottomSheet>
  );
}

export function InsightCards({ title = "For you" }: { title?: string }) {
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [open, setOpen] = useState<Insight | null>(null);

  useEffect(() => {
    fetch("/api/insights")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.detail || json.error);
        setInsights((json as InsightsResponse).insights);
      })
      // WHY quiet: insights are extra; the rest of the Account tab still works.
      .catch((err) => {
        console.error("[insights]", err);
        setInsights([]);
      });
  }, []);

  if (!insights) {
    return (
      <SkeletonGroup>
        <Skeleton className="mb-2 ml-1 h-4 w-16" />
        <div className="-mx-4 flex gap-2.5 overflow-hidden px-4 pb-1">
          {[0, 1].map((i) => (
            <div key={i} className="flex w-[78%] shrink-0 items-center gap-3 rounded-2xl border border-line bg-surface p-3.5">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-4/5" />
                <Skeleton className="h-2.5 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </SkeletonGroup>
    );
  }
  if (insights.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 px-1 text-sm font-semibold">{title}</h2>
      {/* WHY scroll-px-4: tiles snap in line with the page edge; scrollbar hidden (swipe is enough). */}
      <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {insights.map((i) => {
          const kind = KIND[i.kind];
          return (
            <button
              key={i.id}
              type="button"
              onClick={() => setOpen(i)}
              className="flex w-[78%] shrink-0 snap-start items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 text-left"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background text-accent">
                <Icon name={kind.icon} size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] leading-snug">
                  <MoneyText text={i.hook} colors={i.kind === "save_help"} />
                </span>
                <span className="mt-0.5 block text-xs text-muted">{kind.tap}</span>
              </span>
              <Icon name="chevron" size={16} className="shrink-0 text-muted" />
            </button>
          );
        })}
      </div>
      {open && <InsightSheet insight={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
