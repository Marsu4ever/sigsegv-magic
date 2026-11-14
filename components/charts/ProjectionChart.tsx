"use client";
/**
 * "Actual + 2 projected lines" chart: a solid line for the past, and two projected lines
 * from today (one dotted, one dashed) — e.g. "if nothing changes" and "5 % less".
 * Values are running totals in €.
 *
 * Motion (like "Month so far" in Cumulative.tsx): the past line draws itself up to today,
 * then the two projected lines draw on from there. Later data changes (e.g. another %)
 * morph the lines instead of drawing them again. To draw again, give the chart a new `key`.
 *
 * WHY a separate component (not a ChartSpec type): ChartSpec has one series per chart.
 * This keeps ChartRenderer and the shared ChartSpec contract unchanged, and it can be
 * reused for any target or a later overall forecast.
 */
import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ProjectionPoint } from "@/lib/types";
import { formatValue, shortLabel, weekdayDate } from "./format";

/**
 * Round y-axis ticks from about `from` to `to`, e.g. 50, 100, … 350.
 * WHY our own ticks: with a zoomed (non-zero) start Recharts picks odd ones (65, 130, 195).
 */
function niceTicks(from: number, to: number, count = 5): number[] {
  if (to <= from) return [0, Math.max(to, 1)];
  const rough = (to - from) / (count - 1);
  const pow = 10 ** Math.floor(Math.log10(rough));
  // WHY the nearest nice step (not the next bigger one): a big step would round the start
  // down to 0 and undo the zoom.
  const step = [1, 2, 2.5, 5, 10]
    .map((m) => m * pow)
    .reduce((best, s) =>
      Math.abs(Math.log(s / rough)) < Math.abs(Math.log(best / rough)) ? s : best,
    );
  const ticks: number[] = [];
  for (let v = Math.floor(from / step) * step; v < to + step; v += step) {
    ticks.push(Math.round(v * 100) / 100);
  }
  return ticks;
}

type LineKey = "actual" | "noChange" | "withCut";
const COLORS: Record<LineKey, string> = {
  actual: "var(--accent)",
  noChange: "var(--forecast-no-change)",
  withCut: "var(--forecast-with-cut)",
};
// WHY dotted vs dashed + red vs blue: the two projected lines often run close together,
// so they differ in both pattern and color.
// "0.1 5" + round caps draws round dots.
const DOTTED = "0.1 5";
// WHY "5 7" (was "7 4"): round caps add half the line width to each end, so the dashes become
// soft pills of about the same length and gap as before.
const DASHED = "5 7";
// WHY "basis" (B-spline) curves: soft, rounded steps instead of sharp corners at every purchase.
// "monotone" passes through every point, so a jump between two days stays almost square.
// A B-spline never dips below a step (a running total must not look like it goes down) and
// starts / ends exactly on its first and last point, so the lines still meet at today.
// Trade-off: at a sharp step the curve passes a little inside the point; the tooltip shows
// the exact €.
const CURVE = "basis";
const DRAW_MS = 1200; // past line (same feel as "Month so far")
const PROJECT_MS = 700; // projected lines, after the past line

/**
 * The dot that follows the finger / mouse on each line.
 * WHY big + a ring in the surface color: easy to see on a phone and on both themes.
 * strokeDasharray "0": the dashed lines' pattern must not leak onto the dot.
 */
const ACTIVE_DOT = { r: 7, strokeWidth: 3, stroke: "var(--surface)", strokeDasharray: "0" };

export function ProjectionChart({
  points,
  today,
  labels,
  height = 200,
  yFrom = 0,
  showLegend = true,
  animate = true,
  activeIndex,
  onPointClick,
  tooltipHint,
}: {
  points: ProjectionPoint[];
  today: string;
  /** Legend and tooltip names of the three lines. Keep them short (the tooltip is small). */
  labels: { actual: string; noChange: string; withCut: string };
  height?: number;
  /** Zoom: the y axis starts at about this € (rounded down to a tick). Lower values are cut off. */
  yFrom?: number;
  showLegend?: boolean;
  /** false = no draw-in (e.g. coming back to the chart from a detail view). */
  animate?: boolean;
  /** Point whose tooltip is open when the chart appears (e.g. where the user left off). */
  activeIndex?: number;
  /** Tap / click on the chart → the nearest point. */
  onPointClick?: (point: ProjectionPoint, index: number) => void;
  /** Small line at the bottom of the tooltip, e.g. "Tap for purchases". */
  tooltipHint?: string;
}) {
  // WHY: after the first draw, a new % should morph the blue line right away, not wait
  // for the past line's draw time again.
  const [introDone, setIntroDone] = useState(!animate);
  const projectBegin = introDone ? 0 : DRAW_MS;

  const max = Math.max(
    0,
    ...points.flatMap((p) => [p.actual ?? 0, p.noChange ?? 0, p.withCut ?? 0]),
  );
  const ticks = niceTicks(Math.max(0, yFrom), max);
  return (
    <div>
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <LineChart
            // WHY: no focus box on click (see app/globals.css).
            accessibilityLayer={false}
            data={points}
            // WHY top 22: room for the bigger "Today" label above the plot.
            margin={{ top: 22, right: 8, bottom: 0, left: 0 }}
            onClick={(s) => {
              // WHY by date: Recharts 3 gives the label (our dataKey), the index as a string.
              const i = points.findIndex((p) => p.date === String(s?.activeLabel));
              if (i >= 0) onPointClick?.(points[i], i);
            }}
            style={onPointClick ? { cursor: "pointer" } : undefined}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickFormatter={(d) => shortLabel(String(d), false)}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            {/* WHY allowDataOverflow: keeps the zoomed start; the line below it is clipped. */}
            <YAxis
              tick={{ fontSize: 11 }}
              width={44}
              ticks={ticks}
              domain={[ticks[0], ticks[ticks.length - 1]]}
              allowDataOverflow
            />
            <Tooltip
              defaultIndex={activeIndex}
              cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }}
              wrapperStyle={{ outline: "none" }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as ProjectionPoint | undefined;
                return active && p ? (
                  <ProjectionTooltip point={p} today={today} labels={labels} hint={tooltipHint} />
                ) : null;
              }}
            />
            <ReferenceLine
              x={today}
              stroke="var(--muted)"
              strokeDasharray="2 3"
              label={{
                value: "Today",
                fontSize: 13,
                fontWeight: 600,
                fill: "var(--muted)",
                position: "top",
              }}
            />
            {/* WHY no connectNulls: null = "this line has no value here", so it starts/ends at today. */}
            <Line
              type={CURVE}
              dataKey="actual"
              name={labels.actual}
              stroke={COLORS.actual}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              activeDot={ACTIVE_DOT}
              isAnimationActive={animate}
              animationDuration={DRAW_MS}
              animationEasing="ease-out"
              onAnimationEnd={() => setIntroDone(true)}
            />
            <Line
              type={CURVE}
              dataKey="noChange"
              name={labels.noChange}
              stroke={COLORS.noChange}
              strokeDasharray={DOTTED}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
              dot={false}
              activeDot={ACTIVE_DOT}
              isAnimationActive={animate}
              animationBegin={projectBegin}
              animationDuration={PROJECT_MS}
              animationEasing="ease-out"
            />
            <Line
              type={CURVE}
              dataKey="withCut"
              name={labels.withCut}
              stroke={COLORS.withCut}
              strokeDasharray={DASHED}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              dot={false}
              activeDot={ACTIVE_DOT}
              isAnimationActive={animate}
              animationBegin={projectBegin}
              animationDuration={PROJECT_MS}
              animationEasing="ease-out"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* WHY a plain HTML legend: readable on small screens, wraps nicely (as in ChartRenderer). */}
      {showLegend && (
        <ul className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
          <li className="flex items-center gap-1.5">
            <span className="inline-block w-5 border-t-2" style={{ borderColor: COLORS.actual }} />
            {labels.actual}
          </li>
          <li className="flex items-center gap-1.5">
            <span
              className="inline-block w-5 border-t-[3px] border-dotted"
              style={{ borderColor: COLORS.noChange }}
            />
            {labels.noChange}
          </li>
          <li className="flex items-center gap-1.5">
            <span
              className="inline-block w-5 border-t-2 border-dashed"
              style={{ borderColor: COLORS.withCut }}
            />
            {labels.withCut}
          </li>
        </ul>
      )}
    </div>
  );
}

/**
 * The info box that follows the line: the day on top, then one row per line that has a value.
 * WHY only the past line up to today: there all three lines meet, so 3 equal rows were noise.
 * WHY text-foreground for the day: the default Recharts label was too dark on the dark theme.
 */
function ProjectionTooltip({
  point,
  today,
  labels,
  hint,
}: {
  point: ProjectionPoint;
  today: string;
  labels: Record<LineKey, string>;
  hint?: string;
}) {
  const rows: LineKey[] = point.actual !== null ? ["actual"] : ["noChange", "withCut"];
  return (
    <div className="min-w-36 rounded-2xl border border-line bg-surface/95 px-3 py-2.5 text-xs shadow-lg backdrop-blur-sm">
      <div className="mb-1.5 text-[13px] font-semibold text-foreground">
        {point.date === today ? "Today" : weekdayDate(point.date)}
      </div>
      <div className="space-y-1">
        {rows.map((k) => (
          <div key={k} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: COLORS[k] }} />
              {labels[k]}
            </span>
            <span className="font-semibold tabular-nums text-foreground">
              {formatValue(point[k] ?? 0, "€")}
            </span>
          </div>
        ))}
      </div>
      {hint && <div className="mt-2 text-[10px] text-muted">{hint}</div>}
    </div>
  );
}
