"use client";
/**
 * The what-if view: "What if I spent less on X?" (5 / 10 / 20 %). Owner: UI person.
 * Shown above the conversation in the chat when a reply carries a `whatIf`.
 *
 * FLOW: the first result comes from the AI's tool call (ChatMessage.whatIf). The toggle, the
 * % circles and the category buttons call GET /api/what-if (no AI) — it runs the same
 * calculation (lib/insights/whatIfForecast.ts), so the numbers are identical either way.
 * WHY skip the AI here: the user already said exactly what they want; an LLM would add
 * seconds, cost tokens and could pick the wrong arguments.
 *
 * Tapping the chart swaps it for the purchases up to that day (PurchaseList, from
 * GET /api/what-if/purchases); the round ← button brings the chart back with the same point open.
 */
import { useRef, useState } from "react";
import type { ForecastMonths, SpendingTarget, WhatIf } from "@/lib/types";
import { CUT_OPTIONS, FORECAST_LABELS, FORECAST_MONTHS, FORECAST_PERIOD_TEXT } from "@/lib/types";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { CircleOptions } from "@/components/ui/CircleOptions";
import { CountUp } from "@/components/ui/CountUp";
import { EmptyChart } from "@/components/charts/EmptyChart";
import { ProjectionChart } from "@/components/charts/ProjectionChart";
import { PurchaseList } from "@/components/whatif/PurchaseList";
import { EstimateInfo } from "@/components/whatif/EstimateInfo";
import { InfoTip } from "@/components/ui/InfoTip";
import { averageBasisText, formatValue } from "@/components/charts/format";

const CHART_HEIGHT = 280; // WHY taller: no headline above the chart any more

/**
 * Same as targetKey() in lib/insights/targets.ts.
 * WHY a copy: client components must not import server-only lib/insights.
 */
function targetKey(t: SpendingTarget): string {
  return [t.label, t.categories.join(","), t.merchantTypes.join(",")].join("|");
}
const cacheKey = (t: SpendingTarget, months: ForecastMonths, cutPct: number) =>
  `${targetKey(t)}|${months}|${cutPct}`;

export function WhatIfPanel({
  initial,
  onClose,
  onNotice,
}: {
  initial: WhatIf;
  onClose: () => void;
  /** Posts a short note to the chat, e.g. "not enough history for 6 months yet". */
  onNotice?: (text: string) => void;
}) {
  // What the user asked for last (toggle + circles + highlight), and the last result we could show.
  // WHY the % stays when switching period or category: the user picked it on purpose.
  const [req, setReq] = useState({
    target: initial.target,
    months: initial.months,
    cutPct: initial.cutPct,
  });
  const [shown, setShown] = useState<WhatIf>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "You'd save" is tappable: shows / hides the totals (before → after) under it.
  const [showTotals, setShowTotals] = useState(false);
  // The tapped chart point while its purchases are shown (null = the chart is shown).
  const [picked, setPicked] = useState<{ index: number; date: string; prev: string | null } | null>(
    null,
  );
  // After the ← button: the point to open again. WHY no draw-in then: the user is coming back.
  const [returnTo, setReturnTo] = useState<number | null>(null);
  // WHY cache per (target, period, %): going back to a view is instant.
  const cache = useRef<Record<string, WhatIf>>({
    [cacheKey(initial.target, initial.months, initial.cutPct)]: initial,
  });
  // WHY: with fast taps, only the latest request may update the screen.
  const latest = useRef(cacheKey(initial.target, initial.months, initial.cutPct));
  // (target, period) pairs whose short-history note is already in the chat.
  // WHY the initial one counts: the AI's reply already says it.
  const noticed = useRef(new Set([`${targetKey(initial.target)}|${initial.months}`]));

  /**
   * Short history → say it once in the chat, not under the chart.
   * WHY in the chat: the numbers are NOT for the chosen period, so the user must know,
   * but a note in the panel cluttered the view.
   */
  function announceFallback(w: WhatIf) {
    if (w.status !== "fallback" || !w.average) return;
    const k = `${targetKey(w.target)}|${w.months}`;
    if (noticed.current.has(k)) return;
    noticed.current.add(k);
    // WHY average.months: the estimate is the average of ALL the history (DECISIONS.md #34),
    // not only the shorter period the chart shows.
    onNotice?.(
      `Estimate based on ${averageBasisText(w.average.months)} — ` +
        `not enough for ${FORECAST_PERIOD_TEXT[w.months]} yet.`,
    );
  }

  async function load(target: SpendingTarget, months: ForecastMonths, cutPct: number) {
    const key = cacheKey(target, months, cutPct);
    latest.current = key;
    setReq({ target, months, cutPct });
    setError(null);
    setPicked(null);
    setReturnTo(null);
    const hit = cache.current[key];
    if (hit) {
      setShown(hit);
      setLoading(false);
      announceFallback(hit);
      return;
    }
    setLoading(true);
    try {
      const url =
        `/api/what-if?target=${encodeURIComponent(JSON.stringify(target))}` +
        `&months=${months}&cut=${cutPct}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || json.error || `HTTP ${res.status}`);
      cache.current[key] = json as WhatIf;
      if (latest.current === key) {
        setShown(json as WhatIf);
        setLoading(false);
        announceFallback(json as WhatIf);
      }
    } catch (err) {
      console.error("[what-if]", err); // browser DevTools console
      if (latest.current === key) {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    }
  }

  const what = req.target.label.toLowerCase();
  // WHY a key per (target, period): a new one draws the lines again; a new % only morphs them.
  const chartKey = `${targetKey(shown.target)}|${shown.months}`;

  return (
    <section className="space-y-3 rounded-xl bg-surface p-3 shadow-sm" aria-label="What-if">
      {/* WHY relative: the ⓘ box opens below this row, as wide as the card (see InfoTip). */}
      <div className="relative flex items-start justify-between gap-2">
        {/* WHY an inline h2: the ⓘ then follows the question mark, even when the heading wraps. */}
        <div className="pt-1 font-semibold leading-snug">
          <h2 className="inline">What if I spent less on {what}?</h2>
          <InfoTip label="How is this estimated?">
            <EstimateInfo w={shown} />
          </InfoTip>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close what-if view"
          className="-mr-1 h-9 w-9 shrink-0 rounded-full text-muted"
        >
          ✕
        </button>
      </div>

      <SegmentedControl
        ariaLabel="Forecast period"
        options={FORECAST_MONTHS.map((m) => ({ value: m, label: FORECAST_LABELS[m] }))}
        value={req.months}
        onChange={(m) => load(req.target, m, req.cutPct)}
      />

      {/* WHY the old chart stays (dimmed) while the next one loads: no blank "Loading…" jump. */}
      <div aria-busy={loading} style={{ minHeight: CHART_HEIGHT }}>
        {error ? (
          <p className="text-sm text-danger">⚠️ {error}</p>
        ) : shown.status === "not_enough_data" ? (
          <EmptyChart height={CHART_HEIGHT} />
        ) : picked && shown.lookback ? (
          <PurchaseList
            target={shown.target}
            from={shown.lookback.from}
            date={picked.date}
            today={shown.today}
            highlightAfter={picked.prev}
            // WHY: the 3 / 6 month charts have one point per week.
            highlightLabel={shown.months === 1 ? "on this day" : "this week"}
            height={CHART_HEIGHT}
            onClose={() => {
              setReturnTo(picked.index);
              setPicked(null);
            }}
          />
        ) : (
          // WHY two divs: the fade-up animation keeps opacity 1 at its end, which would beat
          // the dimming class on the same element.
          <div key={chartKey} className="fade-up">
            <div className={`transition-opacity duration-300 ${loading ? "opacity-40" : ""}`}>
              <ProjectionChart
                points={shown.points}
                today={shown.today}
                height={CHART_HEIGHT}
                // WHY start the y axis at half of today's total: the gap between the red and blue
                // lines is small at 5 %, and a 0-based axis squashes it into a few pixels.
                yFrom={shown.pastEur / 2}
                // WHY no legend: red = unchanged, blue = the % picked in the circles below.
                showLegend={false}
                animate={returnTo === null}
                activeIndex={returnTo ?? undefined}
                onPointClick={(p, i) => {
                  if (loading) return;
                  setPicked({ index: i, date: p.date, prev: shown.points[i - 1]?.date ?? null });
                }}
                // WHY short: the info box sits on a small chart.
                labels={{ actual: "Spent", noChange: "As now", withCut: `${shown.cutPct}% less` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* WHY outside the chart block: the circles stay put while a new % loads.
          Hidden when there's nothing to cut. */}
      {shown.status !== "not_enough_data" && (
        <CircleOptions
          ariaLabel="How much less"
          options={CUT_OPTIONS.map((c) => ({ value: c, label: `${c}%` }))}
          value={req.cutPct}
          onChange={(c) => load(req.target, req.months, c)}
        />
      )}

      {/* The result for the picked %: the saving big; tap it to see the totals for the period
          (as now → with the cut, labelled under each number).
          WHY hidden by default: the saving is the message, the totals are detail. */}
      {/* WHY dimmed (not hidden) while loading: hiding it made everything below jump. */}
      {!error && shown.status !== "not_enough_data" && (
        <div
          className={`py-4 text-center tabular-nums transition-opacity duration-300 ${
            loading ? "opacity-40" : ""
          }`}
        >
          <button
            type="button"
            onClick={() => setShowTotals((v) => !v)}
            aria-expanded={showTotals}
            className="inline-flex items-center gap-1.5 text-2xl font-bold text-accent"
          >
            {/* WHY whenVisible: the panel opens above the chat, so this is often below the fold;
                it counts up from 0 when scrolled to, then rolls to the new value on a new %. */}
            <span>
              You&apos;d save{" "}
              <CountUp value={shown.savingEur} format={(n) => formatValue(n, "€")} whenVisible />
            </span>
            {/* WHY an SVG chevron (not ▾): big enough to read as "tap me", and it turns smoothly. */}
            <svg
              viewBox="0 0 24 24"
              className={`h-7 w-7 text-muted transition-transform duration-300 motion-reduce:transition-none ${
                showTotals ? "rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {/* WHY grid rows 0fr → 1fr: the totals slide open instead of popping in. */}
          <div
            className={`grid transition-[grid-template-rows,opacity] duration-300 motion-reduce:transition-none ${
              showTotals ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="overflow-hidden text-sm text-muted">
              {/* WHY a 3-column grid: the labels sit centred under their numbers and the arrow
                  stays on the numbers' line. Labels match the chart's ("As now" / "10% less"). */}
              <div className="inline-grid grid-cols-[auto_auto_auto] items-center gap-x-8 pt-1">
                <span>{formatValue(shown.noChangeEur, "€")}</span>
                <span aria-hidden>→</span>
                <span>{formatValue(shown.withCutEur, "€")}</span>
                <span className="text-xs">As now</span>
                <span />
                <span className="text-xs">{shown.cutPct}% less</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* The next biggest everyday categories (up to 2). The server leaves out the one in the
          heading, so after a tap the previous one comes back as a button. */}
      {shown.topCategories.length > 0 && (
        <div className="space-y-2">
          <p className="text-lg font-semibold">What if I spend less on…</p>
          <div className="flex flex-wrap gap-2">
            {shown.topCategories.map((o) => (
              <button
                key={targetKey(o.target)}
                type="button"
                onClick={() => load(o.target, req.months, req.cutPct)}
                // WHY tinted fill, no border: stands out from the white panel and keeps it calm.
                className="min-h-10 rounded-full bg-accent/10 px-4 text-sm font-medium text-accent"
              >
                {o.target.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
