"use client";
/**
 * "Arvaa!" lesson card under a coach reply (PLAN-financial-education.md, idea A). Owner: E.
 *
 * FLOW: guess with the slider → tap Guess → the real number slides in and counts up, with the
 * range around the guess shown on the track → one line to learn, one thing to try, ONE link to
 * S-Pankki (new tab). Everything on the card comes from the server (lib/education/topics.ts);
 * this file only checks the guess and saves it (lib/education/progress.ts).
 *
 * WHY "close enough": nobody guesses 412 € exactly. A guess whose range (± guess.tolerance)
 * holds the real number counts as right (lib/education/guess.ts → isCloseEnough).
 */
import { useEffect, useState } from "react";
import type { LessonLang, LessonSpec } from "@/lib/types";
import { BASKET_LABELS } from "@/lib/types";
import { basketColor } from "@/components/charts/colors";
import { CountUp } from "@/components/ui/CountUp";
import { isCloseEnough } from "@/lib/education/guess";
import { markGuessed, markSeen } from "@/lib/education/progress";

const UI: Record<
  LessonLang,
  {
    guess: string;
    yourGuess: string;
    real: string;
    close: string;
    more: (d: string) => string;
    less: (d: string) => string;
    tryThis: string;
    readMore: string;
  }
> = {
  en: {
    guess: "Guess",
    yourGuess: "Your guess",
    real: "Answer",
    close: "🎯 Close enough!",
    more: (d) => `Not quite: ${d} more than you guessed.`,
    less: (d) => `Not quite: ${d} less than you guessed.`,
    tryThis: "Try this",
    readMore: "Read more",
  },
  fi: {
    guess: "Arvaa",
    yourGuess: "Arvauksesi",
    real: "Oikea vastaus",
    close: "🎯 Tarpeeksi lähellä!",
    more: (d) => `Ei ihan: ${d} enemmän kuin arvasit.`,
    less: (d) => `Ei ihan: ${d} vähemmän kuin arvasit.`,
    tryThis: "Kokeile tätä",
    readMore: "Lue lisää",
  },
};

/** Finnish style for both languages (team rule): "1 240 €", "12 %". */
export function formatGuess(n: number, unit: "€" | "%"): string {
  const r = Math.round(n);
  return unit === "€" ? `${r.toLocaleString("fi-FI")} €` : `${r} %`;
}

export function LessonCard({ spec }: { spec: LessonSpec }) {
  const t = UI[spec.lang];
  const g = spec.guess;
  const [value, setValue] = useState(g.start);
  const [guessed, setGuessed] = useState<number | null>(null);
  const color = (spec.basket && basketColor(BASKET_LABELS[spec.basket])) || "var(--accent)";
  const fmt = (n: number) => formatGuess(n, g.unit);

  function lockIn() {
    setGuessed(value);
    markGuessed(spec, value, isCloseEnough(value, g.answer, g.tolerance));
  }

  return (
    <div
      className="mt-2 w-full rounded-xl border border-line bg-surface p-3"
      style={{ borderLeft: `4px solid ${color}` }}
    >
      {/* WHY no basket name and no "Guess" label: they made the card busier. The left border colour
          still shows the basket, and the slider + Guess button already say what to do. */}
      <p className="text-[15px] font-semibold leading-snug">{spec.hook}</p>

      {guessed === null ? (
        <>
          {/* The guess, then what it is ("Of income kept") under it. */}
          <p className="mt-3 text-center text-2xl font-semibold tabular-nums">{fmt(value)}</p>
          <p className="text-center text-xs text-muted">{g.label}</p>
          <input
            type="range"
            min={g.min}
            max={g.max}
            step={g.step}
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            // WHY: touching the card is opening the lesson (progress.ts). Guess saves seen too.
            onPointerDown={() => markSeen(spec.topic)}
            onKeyDown={() => markSeen(spec.topic)}
            aria-label={`${spec.hook} ${g.label}`}
            aria-valuetext={fmt(value)}
            className="guess-slider mt-1 w-full"
          />
          <div className="flex justify-between text-sm tabular-nums text-muted">
            <span>{fmt(g.min)}</span>
            <span>{fmt(g.max)}</span>
          </div>
          <button
            type="button"
            onClick={lockIn}
            className="mt-3 w-full rounded-full bg-accent py-2.5 text-sm font-semibold text-accent-foreground"
          >
            {t.guess}
          </button>
        </>
      ) : (
        <Reveal spec={spec} guessed={guessed} />
      )}
    </div>
  );
}

/** After the guess: the track with the guess's range, the real number, and the lesson. */
function Reveal({ spec, guessed }: { spec: LessonSpec; guessed: number }) {
  const t = UI[spec.lang];
  const g = spec.guess;
  const fmt = (n: number) => formatGuess(n, g.unit);
  const close = isCloseEnough(guessed, g.answer, g.tolerance);
  const pos = (v: number) => Math.min(100, Math.max(0, ((v - g.min) / (g.max - g.min || 1)) * 100));
  const bandFrom = pos(guessed - g.tolerance);
  const bandTo = pos(guessed + g.tolerance);
  // WHY start at the guess: the real number "slides" away from (or into) the guess's range.
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setLanded(true), 60);
    return () => clearTimeout(id);
  }, []);
  const diff = g.answer - guessed;

  return (
    <div className="fade-up">
      <div className="relative mx-2 mt-5 h-2 rounded-full bg-line" aria-hidden="true">
        {/* The range around the guess: the real number inside it = close enough. */}
        <div
          className={`absolute inset-y-0 rounded-full ${close ? "bg-accent/40" : "bg-muted/30"}`}
          style={{ left: `${bandFrom}%`, width: `${Math.max(bandTo - bandFrom, 2)}%` }}
        />
        <span
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-muted bg-surface"
          style={{ left: `${pos(guessed)}%` }}
        />
        <span
          className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-accent shadow transition-[left] duration-700 ease-out motion-reduce:transition-none"
          style={{ left: `${pos(landed ? g.answer : guessed)}%` }}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-center">
        <div>
          <p className="text-xs text-muted">{t.yourGuess}</p>
          <p className="text-lg font-semibold tabular-nums text-muted">{fmt(guessed)}</p>
        </div>
        <div>
          {/* WHY no label ("Per year") here: the question above already says it; it was clutter. */}
          <p className="text-xs text-muted">{t.real}</p>
          <p className="text-lg font-semibold tabular-nums text-accent">
            <CountUp value={g.answer} format={fmt} delay={150} />
          </p>
        </div>
      </div>

      <p className={`leak-pop mt-2 text-center text-sm font-semibold ${close ? "text-accent" : ""}`}>
        {close ? t.close : diff > 0 ? t.more(fmt(diff)) : t.less(fmt(-diff))}
      </p>

      <p className="mt-3 text-[15px] leading-snug">{spec.body}</p>

      <div className="mt-3 rounded-xl bg-accent/10 p-3">
        <p className="text-xs font-semibold text-accent">{t.tryThis}</p>
        <p className="mt-0.5 text-[15px] leading-snug">{spec.takeaway}</p>
      </div>

      {/* WHY a plain link in a new tab: the team agreed users may leave the app for S-Pankki's own page. */}
      <a
        href={spec.link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex items-center justify-between gap-2 text-sm font-medium text-accent"
      >
        <span>
          {t.readMore}: {spec.link.label}
        </span>
        <span aria-hidden="true">↗</span>
      </a>
    </div>
  );
}
