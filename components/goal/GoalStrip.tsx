"use client";
/**
 * One line on Home about the saving goal → taps through to This week (/week). Owner: UI person.
 *
 * WHY on Home, before the coach insights: it's the first screen people see. One glance tells
 * them where the goal is and what this week asks of them, without another card of numbers.
 * Only shown when a goal is set.
 * WHY a titled, foldable section with a rounded-2xl card: it matches every other Home section.
 */
import Link from "next/link";
import type { GoalView } from "@/lib/types";
import { Icon } from "@/components/ui/Icon";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { eur0 } from "./api";

/** `view` from useGoal() in the page, shared with GoalStartRow (one GET /api/goal). */
export function GoalStrip({ view }: { view: GoalView | null }) {
  if (!view) return null; // no skeleton: it's one line, and it shouldn't push the page around twice

  const g = view.goal;
  // Without a goal: GoalStartRow, lower on Home (DECISIONS.md #60c).
  if (!g) return null;

  const m = view.mission;
  const sub = view.result
    ? view.result.won
      ? "Mission complete 🏆 tap to see"
      : "Week over, tap to see"
    : m
      ? m.status === "over"
        ? `Mission: over the limit (${m.habit})`
        : `Mission: ${eur0(m.leftEur)} left for ${m.habit.toLowerCase()}`
      : g.reached
        ? "Goal reached 🎉"
        : "Pick this week's mission";

  return (
    <CollapsibleSection id="goal" title="Saving goal">
      <Link href="/week#goal" className="block rounded-2xl bg-surface p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-xl" aria-hidden>
            {g.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate font-medium">{g.name}</span>
              <span className="shrink-0 tabular-nums">
                <span className="font-semibold">{eur0(g.savedEur)}</span>
                <span className="text-muted"> / {eur0(g.targetEur)}</span>
              </span>
            </div>
            <div
              className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
              style={{
                background: "color-mix(in srgb, var(--accent) 14%, var(--surface))",
              }}
            >
              <div className="goal-fill h-full rounded-full bg-accent" style={{ width: `${g.pct}%` }} />
            </div>
            <p className="mt-1 truncate text-xs text-muted">{sub}</p>
          </div>
          <Icon name="chevron" size={16} className="text-muted" />
        </div>
      </Link>
    </CollapsibleSection>
  );
}

/**
 * A quiet "Set a goal" line on Home when there is no goal. Opens the setup sheet on /week.
 * WHY low on the page (not up top): it should be findable, but Home's main job is balance
 * and safe to spend (DECISIONS.md #60c). Same section + card look as the rest of Home.
 */
export function GoalStartRow({ view }: { view: GoalView | null }) {
  if (!view || view.goal) return null;
  return (
    <CollapsibleSection id="goal" title="Saving goal">
      <Link href="/week?setup=1" className="flex items-center gap-3 rounded-2xl bg-surface p-4 text-sm shadow-sm">
        <span className="text-xl" aria-hidden>
          🎯
        </span>
        <span className="min-w-0 flex-1 text-muted">
          Saving for something? <span className="font-medium text-accent">Set a goal</span>
        </span>
        <Icon name="chevron" size={16} className="text-muted" />
      </Link>
    </CollapsibleSection>
  );
}
