"use client";
/**
 * "For you" on the Account tab: what the coach noticed without being asked
 * (GET /api/insights → lib/insights/proactive.ts). Swipe sideways through the cards.
 * Each card: what was noticed, the suggested action, why it was noticed, and a link
 * that opens the coach about it. Owner: UI person.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Insight, InsightKind, InsightsResponse } from "@/lib/types";
import { MoneyText } from "@/components/chat/MoneyText";
import { formatValue } from "@/components/charts/format";

const KIND: Record<InsightKind, { label: string; badge: string }> = {
  save_help: { label: "Help to save", badge: "bg-accent/10 text-accent" },
  spending_alert: { label: "Spending alert", badge: "bg-warning-soft text-warning" },
  unusual: { label: "Unusual activity", badge: "bg-danger-soft text-danger" },
  recurring: { label: "Recurring payments", badge: "bg-background text-muted" },
};

const toneClass = (tone?: string) =>
  tone === "in" ? "text-money-in" : tone === "out" ? "text-money-out" : "";

function InsightCard({ insight }: { insight: Insight }) {
  const kind = KIND[insight.kind];
  return (
    <article className="flex w-[85%] shrink-0 snap-center flex-col rounded-xl bg-surface p-4 shadow-sm">
      <span className={`self-start rounded-full px-2 py-0.5 text-[11px] font-semibold ${kind.badge}`}>
        {kind.label}
      </span>
      <h3 className="mt-2 font-semibold leading-snug">{insight.title}</h3>
      <p className="mt-1 text-sm">
        <MoneyText text={insight.detail} />
      </p>

      {insight.table && insight.table.length > 0 && (
        <table className="mt-3 w-full text-sm">
          <tbody>
            {insight.table.map((r, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                <td className="py-1.5 pr-2">{r.label}</td>
                <td className={`py-1.5 text-right tabular-nums ${toneClass(r.tone)}`}>
                  {formatValue(r.value, "€")}
                </td>
              </tr>
            ))}
            {insight.total && (
              <tr className="font-semibold">
                <td className="pt-2 pr-2">{insight.total.label}</td>
                <td className={`pt-2 text-right tabular-nums ${toneClass(insight.table[0]?.tone)}`}>
                  {formatValue(insight.total.value, "€")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <div className="mt-3 rounded-lg bg-background p-3">
        <p className="text-xs font-semibold text-accent">Suggested action</p>
        <p className="mt-0.5 text-sm">
          <MoneyText text={insight.action} />
        </p>
      </div>

      <p className="mt-2 text-xs text-muted">
        <span className="font-medium">Why I noticed: </span>
        <MoneyText text={insight.why} />
      </p>

      <Link
        href={`/chat?ask=${encodeURIComponent(insight.ask)}`}
        className="mt-auto pt-3 text-sm font-medium text-accent"
      >
        Ask the coach about this →
      </Link>
    </article>
  );
}

export function InsightCards() {
  const [insights, setInsights] = useState<Insight[] | null>(null);

  useEffect(() => {
    fetch("/api/insights")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.detail || json.error);
        setInsights((json as InsightsResponse).insights);
      })
      // WHY quiet: insights are extra; the rest of the Account tab still works.
      .catch((err) => console.error("[insights]", err));
  }, []);

  if (!insights || insights.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 px-1 text-sm font-semibold">
        For you <span className="font-normal text-muted">· {insights.length}</span>
      </h2>
      {/* WHY sideways: several cards would push the transactions far down on a phone. */}
      <div className="-mx-4 flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto px-4 pb-1">
        {insights.map((i) => (
          <InsightCard key={i.id} insight={i} />
        ))}
      </div>
    </section>
  );
}
