"use client";
/**
 * Money lessons progress in Home's coach insights. Owner: E.
 * One calm row: a ring + "2 of 5 done". Tap → a sheet listing each lesson by name, a circle for
 * done (✓) / opened but not guessed / not tried, and a button that asks the coach about it.
 * When every lesson is done, the sheet offers "Hide from Home" (like "Hide this insight"); a new
 * lesson brings the row back by itself.
 * WHY no status text under the names (no "You guessed…", "Seen, not guessed yet"): the circle
 * already says it, and the list reads faster without it.
 *
 * WHY the button goes through the chat: asking about a topic is what lets a seen lesson play
 * again (lib/education/topics.ts → teachTool), so replay works the same everywhere.
 * WHY no streaks or badges: PLAN-financial-education.md §2.6, progress is quiet and only adds up.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import type { LessonInfo, LessonsResponse } from "@/lib/types";
import { hideLessonsRow, markSeen, useLessonProgress, useLessonsRowHidden } from "@/lib/education/progress";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Icon } from "@/components/ui/Icon";

/** A small progress ring, e.g. 2 of 5. */
function Ring({ done, total }: { done: number; total: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" className="shrink-0" aria-hidden="true">
      <circle cx="20" cy="20" r={r} fill="none" stroke="var(--line)" strokeWidth="4" />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${(done / Math.max(total, 1)) * c} ${c}`}
        transform="rotate(-90 20 20)"
        className="transition-[stroke-dasharray] duration-500"
      />
      <text x="20" y="24" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--foreground)">
        {done}/{total}
      </text>
    </svg>
  );
}

export function LessonProgress() {
  const [lessons, setLessons] = useState<LessonInfo[] | null>(null);
  const [open, setOpen] = useState(false);
  const progress = useLessonProgress();
  const hidden = useLessonsRowHidden();

  useEffect(() => {
    fetch("/api/lessons")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.detail || json.error);
        setLessons((json as LessonsResponse).lessons);
      })
      // WHY quiet: lessons are extra; the rest of Home still works.
      .catch((err) => console.error("[lessons]", err));
  }, []);

  if (!lessons || lessons.length === 0) return null;
  const done = lessons.filter((l) => progress[l.topic]?.guess).length;
  const allDone = done === lessons.length;
  if (allDone && hidden) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2.5 flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 text-left"
      >
        <Ring done={done} total={lessons.length} />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] leading-snug">
            Money lessons: {done} of {lessons.length} done
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            {allDone ? "All done. Tap to play again" : "Guess a number from your own money"}
          </span>
        </span>
        <Icon name="chevron" size={16} className="shrink-0 text-muted" />
      </button>

      {open && (
        <BottomSheet label="For you" title="Money lessons" onClose={() => setOpen(false)}>
          <p className="mt-1 text-sm text-muted">
            Guess a number from your money, then learn one thing about it.
          </p>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-sm">
            {lessons.map((l) => {
              const rec = progress[l.topic];
              const isDone = !!rec?.guess;
              return (
                <li key={l.topic} className="flex items-center gap-3 px-3 py-3">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                      isDone ? "bg-accent text-accent-foreground" : rec ? "border-2 border-accent" : "border-2 border-line"
                    }`}
                    aria-label={isDone ? "Done" : rec ? "Seen" : "Not tried yet"}
                  >
                    {isDone ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1 text-[15px] font-medium leading-snug">{l.title}</span>
                  <Link
                    href={`/chat?ask=${encodeURIComponent(l.ask)}`}
                    onClick={() => markSeen(l.topic)}
                    className="shrink-0 rounded-full border border-accent px-3 py-1 text-sm font-medium text-accent"
                  >
                    {isDone ? "Again" : "Try it"}
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-center text-xs text-muted">Your progress is saved on this device.</p>
          {allDone && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                hideLessonsRow();
              }}
              className="mt-2 w-full py-2 text-sm text-muted"
            >
              Hide from Home
            </button>
          )}
        </BottomSheet>
      )}
    </>
  );
}
