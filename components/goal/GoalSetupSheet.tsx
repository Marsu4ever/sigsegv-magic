"use client";
/**
 * Set up (or change) a saving goal: a bottom sheet like the insight sheets. Owner: UI person.
 *
 * WHY a live preview while typing: the useful moment is seeing "≈ 26 € a week" and how that
 * compares to what you usually keep, BEFORE committing. The numbers come from the server
 * (POST /api/goal {action:"preview"}, lib/goals/goal.ts), never from this file.
 * WHY gentle when it's a stretch: an amber note with a later date to try, never "you can't".
 */
import { useEffect, useRef, useState } from "react";
import type { GoalDraft } from "@/lib/types";
import { eur0, fiDay, goalAction } from "./api";

const EMOJIS = ["✈️", "📱", "🎓", "🏠", "🎁", "🛟", "🚲", "🎯"];

export type GoalSetupValues = { name?: string; amount?: string; date?: string; start?: string; emoji?: string };

/** "1 000,50" / "1000.5" → 1000.5 (NaN if empty). */
const parseAmount = (s: string) => Number(s.replace(/\s|€/g, "").replace(",", "."));

/** today + n months, as "YYYY-MM-DD" (only to fill the date field; no money math). */
function plusMonths(today: string, n: number): string {
  const [y, m, d] = today.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, last))).toISOString().slice(0, 10);
}

export function GoalSetupSheet({
  today,
  initial,
  editing,
  onClose,
}: {
  today: string;
  initial?: GoalSetupValues;
  editing?: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [date, setDate] = useState(initial?.date ?? "");
  const [start, setStart] = useState(initial?.start ?? "");
  const [draft, setDraft] = useState<GoalDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    if (!initial?.name) nameRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, initial?.name]);

  const body = {
    name: name || undefined,
    emoji: emoji || undefined,
    amountEur: parseAmount(amount),
    byDate: date,
    startEur: parseAmount(start) || 0,
  };
  const key = JSON.stringify(body);
  const ready = Number.isFinite(body.amountEur) && body.amountEur > 0 && !!date;

  // Live preview, debounced so typing "1000" asks once, not four times.
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(async () => {
      const res = await goalAction({ action: "preview", ...JSON.parse(key) });
      if (res.draft) setDraft(res.draft);
    }, 300);
    return () => clearTimeout(t);
  }, [key, ready]);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await goalAction({ action: "create", ...body });
    setSaving(false);
    if (res.error) setError(res.error);
    else onClose();
  }

  const shown = ready ? draft : null;
  const shownEmoji = emoji || shown?.emoji || "🎯";

  return (
    <div className="fixed inset-0 z-40 mx-auto flex max-w-md flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={editing ? "Change your goal" : "Set a saving goal"}
        className="max-h-[90dvh] overflow-y-auto rounded-t-2xl bg-background px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted">Saving goal</p>
            <h2 className="mt-0.5 text-lg font-semibold leading-snug">
              {editing ? "Change your goal" : "What are you saving for?"}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="px-2 text-2xl leading-none text-muted">
            ×
          </button>
        </div>

        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1" role="radiogroup" aria-label="Icon">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              role="radio"
              aria-checked={shownEmoji === e}
              onClick={() => setEmoji(e)}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl transition ${
                shownEmoji === e ? "bg-accent/15 ring-2 ring-accent" : "bg-surface"
              }`}
            >
              {e}
            </button>
          ))}
        </div>

        <label className="mt-3 block text-sm font-medium">
          Name
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            placeholder="Trip to Lisbon"
            className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-[15px] outline-none focus:border-accent"
          />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="block text-sm font-medium">
            Amount
            <div className="mt-1 flex items-center rounded-xl border border-line bg-surface px-3 focus-within:border-accent">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="1 000"
                className="w-full bg-transparent py-2.5 text-[15px] tabular-nums outline-none"
              />
              <span className="text-muted">€</span>
            </div>
          </label>
          <label className="block text-sm font-medium">
            Already set aside
            <div className="mt-1 flex items-center rounded-xl border border-line bg-surface px-3 focus-within:border-accent">
              <input
                value={start}
                onChange={(e) => setStart(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                className="w-full bg-transparent py-2.5 text-[15px] tabular-nums outline-none"
              />
              <span className="text-muted">€</span>
            </div>
          </label>
        </div>

        <label className="mt-3 block text-sm font-medium">
          By when
          <input
            type="date"
            value={date}
            min={today}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-[15px] outline-none focus:border-accent"
          />
        </label>
        <div className="mt-2 flex gap-1.5">
          {[3, 6, 12].map((n) => {
            const d = plusMonths(today, n);
            return (
              <button
                key={n}
                type="button"
                onClick={() => setDate(d)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  date === d ? "bg-accent text-accent-foreground" : "bg-surface text-muted"
                }`}
              >
                {n === 12 ? "In a year" : `In ${n} months`}
              </button>
            );
          })}
        </div>

        {/* The plan, from the server. Space reserved so the sheet doesn't jump. */}
        <div className="mt-4 min-h-[76px] rounded-xl bg-accent/10 p-3" aria-live="polite">
          {!shown ? (
            <p className="text-sm text-muted">Add an amount and a date to see your weekly plan.</p>
          ) : shown.error ? (
            <p className="text-sm text-warning">{shown.error}</p>
          ) : (
            <>
              <p className="text-[15px]">
                <span className="text-2xl font-bold text-accent tabular-nums">≈ {eur0(shown.weeklyNeededEur)}</span>{" "}
                a week for {shown.weeksLeft} weeks
              </p>
              {shown.typicalKeptPerWeekEur !== null && shown.typicalKeptPerWeekEur > 0 && (
                <p className="mt-0.5 text-sm text-muted">
                  You usually keep about {eur0(shown.typicalKeptPerWeekEur)} a week.
                </p>
              )}
              {shown.stretch && (
                <div className="mt-2 rounded-lg bg-warning-soft px-2.5 py-2 text-sm text-warning">
                  {shown.typicalKeptPerWeekEur !== null && shown.weeklyNeededEur > shown.typicalKeptPerWeekEur
                    ? "That's stretch: more than you usually keep in a week."
                    : "That's stretch: more than half of what you usually keep."}
                  {shown.suggestedDate && (
                    <button
                      type="button"
                      onClick={() => setDate(shown.suggestedDate!)}
                      className="ml-1 font-semibold underline underline-offset-2"
                    >
                      Try {fiDay(shown.suggestedDate)}?
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {error && <p className="mt-2 text-sm text-danger">{error}</p>}

        <button
          type="button"
          onClick={save}
          disabled={!shown || !!shown.error || saving}
          className="mt-4 w-full rounded-full bg-accent py-3 text-sm font-semibold text-accent-foreground transition disabled:opacity-40"
        >
          {saving ? "Saving…" : editing ? "Save changes" : `Start saving ${shownEmoji}`}
        </button>
        <p className="mt-2 text-center text-xs text-muted">
          Each week you get one small mission based on your own spending. Only money you move counts.
        </p>
      </div>
    </div>
  );
}
