"use client";
/**
 * Client side of the saving goal (server: app/api/goal, lib/goals/). Owner: UI person.
 *
 * WHY an event: the goal shows in several places (This week, the Account strip, the Leaks
 * chart, the chat draft card). After any change we broadcast the new GoalView, so every
 * place on screen updates at once without re-fetching.
 */
import { useEffect, useState } from "react";
import type { GoalDraft, GoalView } from "@/lib/types";

const EVENT = "goal-changed";

export type GoalActionResponse = { view?: GoalView; draft?: GoalDraft; error?: string; detail?: string };

/** POST one action to /api/goal. Broadcasts the new view to every useGoal() on screen. */
export async function goalAction(body: Record<string, unknown>): Promise<GoalActionResponse> {
  try {
    const res = await fetch("/api/goal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as GoalActionResponse;
    if (json.view && body.action !== "preview") {
      window.dispatchEvent(new CustomEvent<GoalView>(EVENT, { detail: json.view }));
    }
    return json;
  } catch (err) {
    console.error("[goal]", err);
    return { error: "Couldn't reach the app. Try again." };
  }
}

/** The current goal view (null while loading), kept in sync across the page. */
export function useGoal(): { view: GoalView | null; error: string | null } {
  const [view, setView] = useState<GoalView | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/goal")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.detail || json.error);
        if (alive) setView(json);
      })
      .catch((err) => alive && setError(String(err.message ?? err)));
    const onChange = (e: Event) => setView((e as CustomEvent<GoalView>).detail);
    window.addEventListener(EVENT, onChange);
    return () => {
      alive = false;
      window.removeEventListener(EVENT, onChange);
    };
  }, []);
  return { view, error };
}

/** 1520.5 → "1 521 €" (whole euros, Finnish style like the rest of the app). */
export const eur0 = (n: number) => `${Math.round(n).toLocaleString("fi-FI")} €`;

/** "2027-06-30" → "30.6.2027". */
export function fiDay(iso: string, withYear = true): string {
  const [y, m, d] = iso.split("-").map(Number);
  return withYear ? `${d}.${m}.${y}` : `${d}.${m}.`;
}

/** "2026-10-01" → "Thu". */
export function weekday(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
}

/** 0.8 → "almost a day", 1 → "1 day", 3.7 → "4 days". */
export function daysText(days: number): string {
  if (days < 1) return "almost a day";
  const n = Math.round(days);
  return `${n} day${n === 1 ? "" : "s"}`;
}
