"use client";
/**
 * One line on Home about the saving goal → taps through to This week (/week). Owner: UI person.
 *
 * WHY on Home, before the coach insights: it's the first screen people see. One glance tells
 * them where the goal is and what this week asks of them, without another card of numbers.
 * Only shown when a goal is set.
 */
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { eur0, useGoal } from "./api";

export function GoalStrip() {
  const { view } = useGoal();
  if (!view) return null; // no skeleton: it's one line, and it shouldn't push the page around twice

  const g = view.goal;
  // WHY nothing without a goal (team call): Home stays calm; people start a goal from the
  // coach, the "Help to save" insight or the This week page.
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
    <Link href="/week#goal" className="block rounded-xl bg-surface px-4 py-3 shadow-sm">
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
            style={{ background: "color-mix(in srgb, var(--accent) 14%, var(--surface))" }}
          >
            <div className="goal-fill h-full rounded-full bg-accent" style={{ width: `${g.pct}%` }} />
          </div>
          <p className="mt-1 truncate text-xs text-muted">{sub}</p>
        </div>
        <Icon name="chevron" size={16} className="text-muted" />
      </div>
    </Link>
  );
}
