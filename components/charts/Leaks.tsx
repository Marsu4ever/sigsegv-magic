"use client";
/**
 * "Leaks" chart — where money slips away. Owner: UI person.
 * Data: everyday_leaks → `view` (lib/insights/leaks.ts).
 *
 * Four parts, top to bottom:
 *   1. headline: what everyday spending costs in a year, and how much of it is
 *      small stuff (≤ €20 — the drops in the jar)
 *   2. leakiest days: the 2 weekdays with the most everyday spending
 *   3. marble jar: every everyday purchase of the period drops in as a marble
 *      (bigger purchase = bigger marble)
 *   4. habit cards: how often, how much, per year — with a "skip one" chip
 *      (full screen) that shows the saving live in the headline AND turns the
 *      purchases you'd have skipped into green marbles in the jar; and a
 *      "Sparks joy? ✨" chip that turns ALL of that habit's marbles shiny gold
 *      (skip and joy exclude each other — you don't skip what you love)
 *
 * WHY yearly numbers: "€11 a time" feels like nothing; "€1,190 a year" doesn't.
 *
 * ANIMATIONS (team liked them — keep them quick, < 1.5 s in total):
 *   numbers count up (and roll down when a habit is skipped), the jar fills,
 *   lines and cards slide up one after another, the saving line pops in.
 *   CSS lives in app/globals.css; all of it stops with "reduced motion".
 *
 * NO LAYOUT JUMPS (team rule): tapping a chip must not move anything. Every
 * line that can appear (savings, jar captions, crossed-out number) has its
 * space reserved; chip labels never change, only their colour and glow.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ChartSpec, LeaksView } from "@/lib/types";
import { CategoryTile } from "./categoryIcons";

const EVERYDAY = "var(--basket-everyday)";
const GOLD_TEXT = "#a16207"; // readable gold for text on white
const eur0 = (n: number) =>
  n.toLocaleString("fi-FI", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eur = (n: number) => n.toLocaleString("fi-FI", { style: "currency", currency: "EUR" });
const shortDays = (d: [string, string]) => d.map((x) => x.slice(0, 3)).join(" & ");

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A number that counts to `value` (from 0 the first time, then from its last
 * value — so skipping a habit "rolls" the number down).
 */
function CountUp({
  value,
  format,
  duration = 900,
  delay = 0,
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
  delay?: number;
}) {
  const [shown, setShown] = useState(0);
  const current = useRef(0);
  const first = useRef(true);
  useEffect(() => {
    const start = current.current;
    const ms = prefersReducedMotion() ? 0 : duration;
    const wait = first.current ? delay : 0;
    first.current = false;
    let raf = 0;
    let t0: number | null = null;
    const step = (t: number) => {
      if (t0 === null) t0 = t;
      const p = ms === 0 ? 1 : Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3); // fast, then gently settles
      current.current = start + (value - start) * eased;
      setShown(current.current);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    const timer = setTimeout(() => (raf = requestAnimationFrame(step)), wait);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [value, duration, delay]);
  return <>{format(shown)}</>;
}

export function LeaksChart({ spec, compact }: { spec: ChartSpec; compact: boolean }) {
  const v = spec.leaks;
  // Habits the user chose to "skip one" of (full screen).
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  // Is the big jar on screen? (If not, a mini jar follows you down the list.)
  const bigJar = useRef<HTMLDivElement>(null);
  const [bigJarVisible, setBigJarVisible] = useState(true);
  useEffect(() => {
    const el = bigJar.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setBigJarVisible(e.isIntersecting), {
      threshold: 0.15,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [v]);
  // Habits the user said "spark joy" — their marbles turn gold.
  const [joy, setJoy] = useState<Set<string>>(new Set());

  const saved = (v?.habits ?? [])
    .filter((h) => h.skip && skipped.has(h.name))
    .reduce((s, h) => s + (h.skip?.savesPerYearEur ?? 0), 0);
  // Which marbles turn green: for each skipped habit, its purchases in the
  // period, thinned out evenly to match the chip ("every 2nd", "1 a month"…).
  const green = useMemo(() => greenMarbles(v, skipped), [v, skipped]);
  const greenEur = v ? [...green].reduce((s, i) => s + v.drops[i].amount, 0) : 0;
  const gold = useMemo(
    () => new Set(v ? v.drops.flatMap((d, i) => (joy.has(d.habit) ? [i] : [])) : []),
    [v, joy],
  );
  const without = (set: Set<string>, name: string) => {
    const next = new Set(set);
    next.delete(name);
    return next;
  };
  const toggleSkip = (name: string) => {
    if (skipped.has(name)) return setSkipped(without(skipped, name));
    setSkipped(new Set(skipped).add(name));
    setJoy(without(joy, name)); // can't skip what sparks joy
  };
  const toggleJoy = (name: string) => {
    if (joy.has(name)) return setJoy(without(joy, name));
    setJoy(new Set(joy).add(name));
    setSkipped(without(skipped, name));
  };

  if (!v) return <p className="py-6 text-center text-sm text-muted">No data.</p>;

  return (
    <div className="space-y-3">
      <div className={compact ? "flex items-center gap-3" : "space-y-3"}>
        <Headline v={v} saved={saved} compact={compact} />
        {compact && <MarbleJar drops={v.drops} green={green} gold={gold} width={84} />}
      </div>

      {!compact && (
        <div ref={bigJar} className="flex flex-col items-center">
          {/* The period, said once, as a small pill above the jar. */}
          <span className="mb-2 rounded-full bg-background px-3 py-0.5 text-xs font-semibold text-muted">
            Last {v.periodDays} days
          </span>
          <MarbleJar drops={v.drops} green={green} gold={gold} width={170} />
          {/* Under the jar: a tiny table so the euro amounts line up.
              Joy and skip rows are always there (empty = invisible), so the
              cards below never move. */}
          <div
            className="leak-fade-up mt-2 grid w-60 grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-xs tabular-nums"
            style={{ animationDelay: "900ms" }}
          >
            <span className="text-muted">
              {v.drops.length} purchase{v.drops.length === 1 ? "" : "s"}
            </span>
            <span className="text-right font-semibold">
              <CountUp value={v.drops.reduce((s, d) => s + d.amount, 0)} format={eur} delay={900} />
            </span>
            <span
              className={`font-semibold ${gold.size ? "" : "invisible"}`}
              style={{ color: GOLD_TEXT }}
            >
              ✨ {gold.size} sparked joy
            </span>
            <span
              className={`text-right font-semibold ${gold.size ? "" : "invisible"}`}
              style={{ color: GOLD_TEXT }}
            >
              <CountUp
                value={[...gold].reduce((s, i) => s + v.drops[i].amount, 0)}
                format={eur}
                duration={500}
              />
            </span>
            <span className={`font-semibold text-accent ${green.size ? "" : "invisible"}`}>
              ● {green.size} skipped
            </span>
            <span
              className={`text-right font-semibold text-accent ${green.size ? "" : "invisible"}`}
            >
              <CountUp value={greenEur} format={eur} duration={500} />
            </span>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {/* Mini jar that follows you down the habit list once the big jar is
            off screen — top-right corner, big enough to see marbles change.
            WHY sticky with zero height: it floats over the cards without taking
            any space (no layout jump). Pops in with a little overshoot. */}
        {!compact && (
          <div className="pointer-events-none sticky top-2 z-10 h-0">
            <div
              className="absolute right-0 top-0 origin-top-right rounded-2xl border border-line bg-surface p-2 shadow-lg"
              style={{
                transition:
                  "opacity 250ms ease-out, transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                opacity: bigJarVisible ? 0 : 1,
                transform: bigJarVisible ? "scale(0.6) translateY(-8px)" : "scale(1)",
              }}
            >
              <MarbleJar drops={v.drops} green={green} gold={gold} width={140} animate={false} />
              <div className="mt-1 flex h-5 justify-center gap-3 text-sm font-semibold tabular-nums">
                {gold.size > 0 && <span style={{ color: GOLD_TEXT }}>✨{gold.size}</span>}
                {green.size > 0 && <span className="text-accent">●{green.size}</span>}
              </div>
            </div>
          </div>
        )}
        {/* Chat card shows only the 3 biggest — say so; full screen shows all. */}
        {compact ? (
          // Chat card: "Top 3" in bold yellow (no pill — team call).
          // WHY #ca8a04: a deep yellow that stays readable on white.
          <h3 className="text-base font-bold" style={{ color: "#ca8a04" }}>
            Top 3
          </h3>
        ) : (
          <h3 className="text-sm font-semibold">Your habits, per year</h3>
        )}
        {(compact ? v.habits.slice(0, 3) : v.habits).map((h, i) => (
          <HabitCard
            key={h.name}
            index={i}
            h={h}
            compact={compact}
            skipped={skipped.has(h.name)}
            onSkip={() => toggleSkip(h.name)}
            joy={joy.has(h.name)}
            onJoy={() => toggleJoy(h.name)}
          />
        ))}
      </div>
    </div>
  );
}

function Headline({ v, saved, compact }: { v: LeaksView; saved: number; compact: boolean }) {
  return (
    <div
      className="flex-1 rounded-xl px-3 py-2.5 text-center"
      style={{ background: `color-mix(in srgb, ${EVERYDAY} 9%, white)` }}
    >
      <div className="text-xs text-muted">Everyday spending costs you</div>
      <div
        className={`font-bold tabular-nums ${compact ? "text-2xl" : "text-4xl"}`}
        style={{ color: EVERYDAY }}
      >
        <CountUp value={v.everydayPerYearEur} format={eur0} duration={1100} delay={100} />
        <span className="ml-1 text-sm font-semibold">a year</span>
      </div>
      {/* Always one line tall, so nothing below moves when it fills in.
          (Chat card has no chips, so no line needed there.) */}
      {!compact && (
        <div className="mt-1 h-5 text-sm font-semibold text-accent">
          {saved > 0 && (
            <>
              Skipping saves you <CountUp value={saved} format={eur0} duration={600} /> a year 🎉
            </>
          )}
        </div>
      )}
      {/* Small stuff sits at the bottom of the box (team call); not in the chat card. */}
      {!compact && (
        <div className="mt-2 text-xs text-muted">
          small stuff (≤ €{v.smallMaxEur}) alone:{" "}
          <span className="font-semibold text-foreground">
            <CountUp value={v.smallPerYearEur} format={eur0} delay={300} />
          </span>
        </div>
      )}
      {/* Full screen only, under "small stuff" (team call). */}
      {!compact && v.leakiestDays && (
        <div className="mt-0.5 text-xs text-muted">
          <span className="font-semibold text-foreground">{shortDays(v.leakiestDays.days)}</span>{" "}
          are your leakiest days ({Math.round(v.leakiestDays.share * 100)}%)
        </div>
      )}
    </div>
  );
}

/** Indices of the marbles that turn green for the skipped habits. */
function greenMarbles(v: LeaksView | undefined, skipped: Set<string>): Set<number> {
  const out = new Set<number>();
  if (!v) return out;
  for (const h of v.habits) {
    if (!h.skip || !skipped.has(h.name)) continue;
    const mine = v.drops.flatMap((d, i) => (d.habit === h.name ? [i] : []));
    const n = mine.length;
    const want =
      h.skip.label === "Skip 1 a week"
        ? Math.round(v.periodDays / 7)
        : h.skip.label === "Skip 1 a month"
          ? Math.round(v.periodDays / 30)
          : Math.floor(n / 2);
    const k = Math.min(n, want);
    // Spread the green ones evenly through time (every 2nd, every 4th…).
    for (let j = 0; j < n; j++) {
      if (Math.floor(((j + 1) * k) / n) > Math.floor((j * k) / n)) out.add(mine[j]);
    }
  }
  return out;
}

/**
 * The marble jar: one marble per everyday purchase, dropping in oldest first
 * and bouncing on landing. Marble AREA follows the euros (so a €200 purchase is
 * clearly bigger than a €5 one, without hiding the small ones).
 * Green marbles = purchases you'd have skipped (they flip with a little pop).
 */
function MarbleJar({
  drops,
  green,
  gold,
  width,
  animate = true,
}: {
  drops: LeaksView["drops"];
  green: Set<number>;
  gold: Set<number>;
  width: number;
  animate?: boolean; // false = marbles already in place (the mini jar)
}) {
  // WHY useId: two jars can be on screen (chat + full screen); gradient ids must differ.
  const goldId = `gold-${useId().replace(/:/g, "")}`;
  const dots = useMemo(() => {
    // Jar interior in SVG units (viewBox 120 × 160).
    const IN = { left: 16, right: 104, bottom: 150, top: 40 };
    const n = drops.length;
    if (n === 0) return [];
    const w = IN.right - IN.left;
    const h = IN.bottom - IN.top;
    const d = Math.max(4, Math.min(16, Math.floor(Math.sqrt((w * h) / n))));
    const cols = Math.max(1, Math.floor(w / d));
    const max = Math.max(...drops.map((p) => p.amount));
    const spread = Math.min(1100, 30 * n); // whole animation ≈ 1 s
    return drops.map((p, k) => {
      const row = Math.floor(k / cols);
      const col = k % cols;
      const x = IN.left + col * d + d / 2 + (row % 2 ? d / 4 : 0);
      const y = IN.bottom - row * d - d / 2;
      const size = Math.sqrt(p.amount / max); // area ∝ euros
      return {
        x: Math.min(x, IN.right - d / 2),
        y: Math.max(y, IN.top + d / 2),
        r: (d / 2) * (0.35 + 0.6 * size),
        delay: Math.round((k / n) * spread),
        fall: -(y - 6),
        opacity: 0.6 + 0.4 * size,
      };
    });
  }, [drops]);

  return (
    <svg
      width={width}
      viewBox="0 0 120 160"
      role="img"
      aria-label={`${drops.length} purchases as marbles in a jar, ${green.size} green`}
    >
      {/* Shiny gold: a light spot top-left fading to deep gold = a little shine. */}
      <defs>
        <radialGradient id={goldId} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#fffbe6" />
          <stop offset="35%" stopColor="#fcd34d" />
          <stop offset="100%" stopColor="#ca8a04" />
        </radialGradient>
      </defs>
      {/* Jar: neck + body, drawn as outlines. */}
      <rect
        x="34"
        y="6"
        width="52"
        height="10"
        rx="3"
        fill="none"
        stroke="var(--muted)"
        strokeWidth="1.5"
      />
      <path
        d="M38 16 V28 Q10 30 10 52 V140 Q10 156 26 156 H94 Q110 156 110 140 V52 Q110 30 82 28 V16"
        fill="color-mix(in srgb, var(--basket-everyday) 5%, white)"
        stroke="var(--muted)"
        strokeWidth="1.5"
      />
      {dots.map((d, i) => {
        const isGreen = green.has(i);
        const isGold = !isGreen && gold.has(i);
        return (
          // WHY a <g> for the drop: the circle inside can then animate on its
          // own (green pop) without replaying the drop.
          <g
            key={i}
            className={animate ? "jar-drop" : undefined}
            style={
              { "--fall": `${d.fall}px`, animationDelay: `${d.delay}ms` } as React.CSSProperties
            }
          >
            <circle
              cx={d.x}
              cy={d.y}
              r={d.r}
              fill={isGreen ? "var(--accent)" : isGold ? `url(#${goldId})` : EVERYDAY}
              opacity={isGreen || isGold ? 1 : d.opacity}
              className={isGreen ? "marble-green" : isGold ? "marble-gold" : undefined}
              style={{ transition: "fill 0.35s, opacity 0.35s" }}
            />
          </g>
        );
      })}
    </svg>
  );
}

function HabitCard({
  h,
  index,
  compact,
  skipped,
  onSkip,
  joy,
  onJoy,
}: {
  h: LeaksView["habits"][number];
  index: number;
  compact: boolean;
  skipped: boolean;
  onSkip: () => void;
  joy: boolean;
  onJoy: () => void;
}) {
  const after = h.skip && skipped ? h.perYearEur - h.skip.savesPerYearEur : null;
  return (
    <div
      className={`leak-fade-up border border-line bg-surface ${
        compact ? "rounded-xl px-2.5 py-2" : "rounded-2xl p-4 shadow-sm"
      }`}
      style={{ animationDelay: `${400 + index * 90}ms` }}
    >
      <div className={`flex items-center ${compact ? "gap-2.5" : "gap-3"}`}>
        <CategoryTile category={h.category} size={compact ? 28 : 40} />
        <div className="min-w-0 flex-1">
          <div className={`truncate font-semibold ${compact ? "text-sm" : "text-base"}`}>
            {h.name}
          </div>
          <div className="text-xs text-muted">
            {h.timesPerMonth.toLocaleString("fi-FI", { maximumFractionDigits: 1 })}× a month · ~
            {eur(h.averageEur)} each
          </div>
        </div>
        <div className="text-right">
          {/* Skipping rolls the number down; the old one sits crossed out on the
              same line, so the card's height never changes. */}
          <div className="flex items-baseline justify-end gap-1.5">
            {after !== null && (
              <span className="text-xs text-muted line-through tabular-nums">
                {eur0(h.perYearEur)}
              </span>
            )}
            <span
              className={`font-bold tabular-nums ${compact ? "" : "text-lg"} ${
                after !== null ? "text-accent" : ""
              }`}
            >
              <CountUp
                value={after ?? h.perYearEur}
                format={eur0}
                duration={after !== null ? 600 : 900}
                delay={400 + index * 90}
              />
            </span>
          </div>
          <div className="text-[11px] text-muted">a year</div>
          {/* The saving, in green — its line is always there (empty when off). */}
          {!compact && h.skip && (
            <div
              className={`text-[11px] font-semibold text-accent tabular-nums ${
                after !== null ? "" : "invisible"
              }`}
            >
              saves {eur0(h.skip.savesPerYearEur)}
            </div>
          )}
        </div>
      </div>

      {/* Chips — full screen only (the chat card opens on tap). "Sparks joy"
          first: keeping what you love is as valid as cutting. Labels never
          change; "on" = colour + a quiet, still glow. */}
      {!compact && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onJoy}
            aria-pressed={joy}
            className="rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all active:scale-95"
            style={
              joy
                ? {
                    background: "#fef3c7",
                    borderColor: "#fcd34d",
                    color: GOLD_TEXT,
                    boxShadow: "0 0 12px 2px rgba(250, 204, 21, 0.55)",
                  }
                : { borderColor: "var(--line)", color: GOLD_TEXT }
            }
          >
            Sparks joy ✨
          </button>
          {h.skip && (
            <button
              type="button"
              onClick={onSkip}
              aria-pressed={skipped}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all active:scale-95 ${
                skipped
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-line text-accent"
              }`}
              style={
                skipped
                  ? { boxShadow: "0 0 12px 2px color-mix(in srgb, var(--accent) 45%, transparent)" }
                  : undefined
              }
            >
              {h.skip.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
