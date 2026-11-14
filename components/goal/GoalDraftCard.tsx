"use client";
/**
 * "Save goal" card under a coach reply (ChatMessage.goalDraft, from the plan_goal tool).
 * Owner: UI person.
 *
 * WHY the user saves it, not the AI: the coach turned a sentence into a goal, and this card
 * shows exactly what it understood (name, amount, date) so a misread is caught before
 * anything is stored. "Change" opens the same values in the setup sheet on This week.
 */
import Link from "next/link";
import { useState } from "react";
import type { GoalDraft } from "@/lib/types";
import { eur0, fiDay, goalAction, useGoal } from "./api";

export function GoalDraftCard({ draft }: { draft: GoalDraft }) {
  const { view } = useGoal();
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  // Already this exact goal (e.g. the chat was scrolled back to) → show it as saved.
  const g = view?.goal;
  const same = g && g.name === draft.name && g.targetEur === draft.targetEur && g.byDate === draft.byDate;
  const saved = state === "saved" || same;

  async function save() {
    setState("saving");
    setError(null);
    const res = await goalAction({
      action: "create",
      name: draft.name,
      emoji: draft.emoji,
      amountEur: draft.targetEur,
      byDate: draft.byDate,
      startEur: draft.startEur,
    });
    if (res.error) {
      setError(res.error);
      setState("idle");
    } else setState("saved");
  }

  const change = `/week?${new URLSearchParams({
    setup: "1",
    name: draft.name,
    amount: String(draft.targetEur),
    date: draft.byDate,
    start: String(draft.startEur),
  })}`;

  return (
    <div className="mt-2.5 rounded-xl border border-line bg-background p-3">
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl"
          style={{ background: "color-mix(in srgb, var(--accent) 14%, var(--surface))" }}
          aria-hidden
        >
          {draft.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{draft.name}</p>
          <p className="text-sm text-muted tabular-nums">
            {eur0(draft.targetEur)} by {fiDay(draft.byDate)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-bold text-accent tabular-nums">{eur0(draft.weeklyNeededEur)}</p>
          <p className="text-[11px] text-muted">a week</p>
        </div>
      </div>
      {draft.stretch && (
        <p className="mt-2 rounded-lg bg-warning-soft px-2.5 py-1.5 text-xs text-warning">
          {draft.typicalKeptPerWeekEur !== null && draft.weeklyNeededEur > draft.typicalKeptPerWeekEur
            ? "A stretch: more than you usually keep in a week."
            : "A stretch: more than half of what you usually keep."}
          {draft.suggestedDate && ` ${fiDay(draft.suggestedDate)} would be easier.`}
        </p>
      )}
      {saved ? (
        <Link
          href="/week#goal"
          className="leak-pop mt-3 flex w-full items-center justify-center rounded-full bg-accent/15 py-2.5 text-sm font-semibold text-accent"
        >
          ✓ Saved · see it in This week →
        </Link>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={state === "saving" || !view}
            className="flex-1 rounded-full bg-accent py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            {state === "saving" ? "Saving…" : g ? "Replace my goal" : "Save goal"}
          </button>
          <Link href={change} className="rounded-full border border-line px-4 py-2.5 text-sm font-semibold">
            Change
          </Link>
        </div>
      )}
      {g && !saved && <p className="mt-1.5 text-xs text-muted">This replaces &ldquo;{g.name}&rdquo;. Your level stays.</p>}
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
}
