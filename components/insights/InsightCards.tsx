"use client";
/**
 * Coach insights on Home: what the coach noticed without being asked. Owner: UI person.
 * Data: GET /api/insights → lib/insights/proactive.ts. The screen never makes up an
 * observation: every card, number and suggestion comes from that endpoint.
 *
 * A card (compact, one at a time, swipe left / right for the next — SwipeCarousel): category + severity on top, one line with the number
 * ("Restaurants up 274 % this month"), and the suggested action in a few words.
 * Tap → a sheet with the explanation, the numbers, "Try this", why it was noticed, and
 * "Ask the coach about this" (the chat starts with this insight as context).
 * × hides a card on this device; "Show hidden" brings them back. "Coming up" risks can't be hidden.
 * WHY calm colours: only severity gets colour (a small label + icon), so nothing shouts.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Insight, InsightKind, InsightSeverity, InsightsResponse } from "@/lib/types";
import { MoneyText } from "@/components/chat/MoneyText";
import { formatValue } from "@/components/charts/format";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { LessonProgress } from "@/components/education/LessonProgress";
import { SwipeCarousel } from "@/components/ui/SwipeCarousel";

const KIND: Record<InsightKind, { label: string; icon: IconName }> = {
  risk: { label: "Coming up", icon: "alert" },
  save_help: { label: "Savings", icon: "piggy" },
  spending_alert: { label: "Spending change", icon: "trend" },
  unusual: { label: "Unusual activity", icon: "shield" },
  recurring: { label: "Recurring", icon: "calendar" },
  positive: { label: "Good habit", icon: "sparkles" },
};

const SEVERITY: Record<InsightSeverity, { label: string; color: string }> = {
  risk: { label: "Needs attention", color: "var(--money-out)" },
  watch: { label: "Worth a look", color: "var(--warning)" },
  info: { label: "Good to know", color: "var(--muted)" },
  good: { label: "Nice work", color: "var(--accent)" },
};

/** WHY "coming up" risks can't be hidden: bills you can't cover shouldn't disappear with one tap. */
const canDismiss = (i: Insight) => i.kind !== "risk";

// ─── Hidden cards (this device only) ─────────────────────────────────────
// WHY localStorage: hiding a card is a personal convenience, not data the bank keeps.
// WHY id + hook as the key: the card comes back by itself when its numbers change.
const STORE = "money-coach:hidden-insights";
const keyOf = (i: Insight) => `${i.id}|${i.hook}`;
function loadHidden(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "[]") as string[];
  } catch {
    return [];
  }
}
function saveHidden(keys: string[]) {
  try {
    localStorage.setItem(STORE, JSON.stringify(keys.slice(-50)));
  } catch {
    // private mode etc.: hiding then lasts only until the page reloads
  }
}

const toneClass = (tone?: string) =>
  tone === "in" ? "text-money-in" : tone === "out" ? "text-money-out" : "";

/** The chat link: the question, plus the insight itself so the coach continues from it. */
function askHref(i: Insight): string {
  return `/chat?ask=${encodeURIComponent(i.ask)}&ctx=${encodeURIComponent(`${i.title}. ${i.detail}`)}`;
}

/**
 * The category, in the severity's colour (dot + text). WHY not "category · severity" here:
 * both didn't fit on a phone card; the sheet spells out the severity, and so does the
 * screen-reader text.
 */
function Label({ i }: { i: Insight }) {
  return (
    <span
      className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{ color: SEVERITY[i.severity].color }}
      title={SEVERITY[i.severity].label}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SEVERITY[i.severity].color }} />
      <span className="truncate">{KIND[i.kind].label}</span>
      <span className="sr-only">, {SEVERITY[i.severity].label}</span>
    </span>
  );
}

/** The full insight, in a sheet that slides up from the bottom. */
function InsightSheet({ insight, onClose, onHide }: { insight: Insight; onClose: () => void; onHide: () => void }) {
  return (
    <BottomSheet label={`${KIND[insight.kind].label} · ${SEVERITY[insight.severity].label}`} title={insight.title} onClose={onClose}>
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
        href={askHref(insight)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3 text-sm font-semibold text-accent-foreground"
      >
        <Icon name="chat" size={18} /> Ask the coach about this
      </Link>
      {/* WHY only for "help to save": a goal turns "you keep little" into something to do
          this week (DECISIONS.md #60c). */}
      {insight.kind === "save_help" && (
        <Link
          href="/week?setup=1"
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-line py-3 text-sm font-semibold"
        >
          🎯 Set a savings goal
        </Link>
      )}
      {canDismiss(insight) && (
        <button type="button" onClick={onHide} className="mt-2 w-full py-2 text-sm text-muted">
          Hide this insight
        </button>
      )}
    </BottomSheet>
  );
}

function AllClear({ hiddenCount, onShow }: { hiddenCount: number; onShow: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
        <Icon name="leaf" size={19} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{hiddenCount ? "You've hidden all insights" : "All clear for now"}</p>
        <p className="text-xs text-muted">
          {hiddenCount
            ? "The coach still keeps an eye on things and adds new ones here."
            : "Nothing needs your attention. The coach keeps watching and will flag anything new here."}
        </p>
        {hiddenCount > 0 && (
          <button type="button" onClick={onShow} className="mt-1 text-xs font-semibold text-accent">
            Show them again
          </button>
        )}
      </div>
    </div>
  );
}

export function InsightCards({ title = "For you" }: { title?: string }) {
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [open, setOpen] = useState<Insight | null>(null);
  const [hidden, setHidden] = useState<string[]>(() => (typeof window === "undefined" ? [] : loadHidden()));
  // WHY its own state (was: an empty list): a failed request must not say "All clear".
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    fetch("/api/insights")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.detail || json.error);
        setInsights((json as InsightsResponse).insights);
        setFailed(false);
      })
      .catch((err) => {
        console.error("[insights]", err);
        setFailed(true);
      });
  }, [attempt]);

  function hide(i: Insight) {
    const next = [...hidden.filter((k) => k !== keyOf(i)), keyOf(i)];
    setHidden(next);
    saveHidden(next);
    setOpen(null);
  }
  function showHidden() {
    const mine = new Set((insights ?? []).map(keyOf));
    const next = hidden.filter((k) => !mine.has(k));
    setHidden(next);
    saveHidden(next);
  }

  if (failed && !insights) {
    // Insights are extra: say they're missing, offer a retry, and let the rest of Home work.
    return (
      <CollapsibleSection id="insights" title={title}>
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
          <Icon name="alert" size={18} className="shrink-0 text-muted" />
          <p className="min-w-0 flex-1 text-sm text-muted">Couldn&apos;t load the coach&apos;s insights right now.</p>
          <button
            type="button"
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
            className="shrink-0 text-xs font-semibold text-accent"
          >
            Try again
          </button>
        </div>
        {/* Lesson progress doesn't depend on insights, so it still shows. */}
        <LessonProgress />
      </CollapsibleSection>
    );
  }
  if (!insights) {
    return (
      <CollapsibleSection id="insights" title={title}>
        <SkeletonGroup>
          <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-3.5">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-2.5 w-1/2" />
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-2.5 w-2/5" />
            </div>
          </div>
        </SkeletonGroup>
      </CollapsibleSection>
    );
  }

  const visible = insights.filter((i) => !hidden.includes(keyOf(i)));
  const hiddenCount = insights.length - visible.length;

  return (
    <CollapsibleSection
      id="insights"
      title={title}
      aside={
        hiddenCount > 0 &&
        visible.length > 0 && (
          <button type="button" onClick={showHidden} className="text-xs font-medium text-accent">
            Show hidden ({hiddenCount})
          </button>
        )
      }
    >

      {visible.length === 0 ? (
        <AllClear hiddenCount={hiddenCount} onShow={showHidden} />
      ) : (
        // WHY one at a time (was: a sideways row of 80 % cards): the row ran past the page's
        // right edge, and one card reads calmer. Same width as the account card above.
        <SwipeCarousel
          items={visible}
          getKey={(i) => i.id}
          label={title}
          itemLabel="insight"
          renderItem={(i) => (
            <div className="relative h-full rounded-2xl border border-line bg-surface">
              <button type="button" onClick={() => setOpen(i)} className="flex h-full w-full items-start gap-3 p-3.5 text-left">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  style={{
                    color: SEVERITY[i.severity].color,
                    background: `color-mix(in srgb, ${SEVERITY[i.severity].color} 12%, var(--surface))`,
                  }}
                >
                  <Icon name={KIND[i.kind].icon} size={19} />
                </span>
                <span className="min-w-0 flex-1 pr-5">
                  <Label i={i} />
                  <span className="mt-0.5 block text-[15px] font-medium leading-snug">
                    {/* Green / red only where the number is the point: savings, risks. */}
                    <MoneyText text={i.hook} colors={i.kind === "save_help" || i.kind === "risk"} />
                  </span>
                  <span className="mt-1 flex items-center gap-0.5 text-xs font-medium text-accent">
                    {i.cta}
                    <Icon name="chevron" size={13} />
                  </span>
                </span>
              </button>
              {canDismiss(i) && (
                <button
                  type="button"
                  onClick={() => hide(i)}
                  aria-label={`Hide: ${i.title}`}
                  className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-2"
                >
                  <Icon name="close" size={15} />
                </button>
              )}
            </div>
          )}
        />
      )}

      {/* Money lessons: how many "guess the number" cards are done (components/education). */}
      <LessonProgress />
      {open && <InsightSheet insight={open} onClose={() => setOpen(null)} onHide={() => hide(open)} />}
    </CollapsibleSection>
  );
}
