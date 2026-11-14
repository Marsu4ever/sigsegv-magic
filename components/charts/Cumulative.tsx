"use client";
/**
 * "Month so far" chart — running total of spending per day of the month.
 * Owner: UI person. Data: month_progress (lib/insights/monthProgress.ts).
 *
 *   solid line  = this month (draws itself when shown)
 *   dotted line = projection to month end (draws after the solid line)
 *   dashed line = last month (already there, for comparison)
 *
 * Full screen also shows the key numbers and the biggest expenses
 * (first 5, "Show more" adds 5 at a time — no endless list).
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
import type { ChartSpec } from "@/lib/types";

const eur = (n: number) => n.toLocaleString("fi-FI", { style: "currency", currency: "EUR" });
const LAST_MONTH_COLOR = "#9aa39a";
const DRAW_MS = 1400;

export function CumulativeChart({ spec, compact }: { spec: ChartSpec; compact: boolean }) {
  const [shown, setShown] = useState(5);
  const valid = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

  // Index of "today" = the last real (not projected) day.
  const todayIdx = spec.rows.reduce(
    (last, r, i) => (!r.projected && valid(r.value) ? i : last),
    -1,
  );
  const data = spec.rows.map((r, i) => ({
    label: r.label,
    actual: !r.projected && valid(r.value) ? r.value : undefined,
    // The projection starts at today's real value so the two lines connect.
    projection: (r.projected && valid(r.value)) || i === todayIdx ? r.value : undefined,
    last: r.value2,
  }));
  const hasProjection = spec.rows.some((r) => r.projected);
  const [thisName, lastName] = spec.seriesNames ?? ["This month", "Last month"];
  const facts = spec.facts ?? [];
  const items = spec.items ?? [];

  return (
    <div className="space-y-3">
      {/* Key numbers (2 in the card, all 4 in full screen) */}
      {facts.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {(compact ? facts.slice(0, 2) : facts).map((f) => (
            <div key={f.label} className="rounded-lg bg-background px-2.5 py-1.5">
              <div className="text-[11px] text-muted">{f.label}</div>
              <div className="font-semibold tabular-nums">{eur(f.value)}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ width: "100%", height: compact ? 170 : 300 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: compact ? 8 : 20, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={compact ? 6 : 4} />
            <YAxis tick={{ fontSize: 11 }} width={44} />
            <Tooltip
              labelFormatter={(d) => `Day ${d}`}
              formatter={(v, name) => [eur(Number(v)), String(name)]}
            />
            {todayIdx >= 0 && hasProjection && (
              <ReferenceLine
                x={data[todayIdx].label}
                stroke="var(--muted)"
                strokeDasharray="2 3"
                label={
                  compact
                    ? undefined
                    : { value: "today", fontSize: 10, fill: "var(--muted)", position: "top" }
                }
              />
            )}
            {/* Last month: dashed, no animation — it's "already there". */}
            <Line
              dataKey="last"
              name={lastName}
              stroke={LAST_MONTH_COLOR}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              isAnimationActive={false}
            />
            {/* This month: draws itself from day 1 to today. */}
            <Line
              dataKey="actual"
              name={thisName}
              stroke="var(--accent)"
              strokeWidth={2.5}
              dot={false}
              animationDuration={DRAW_MS}
              animationEasing="ease-out"
            />
            {/* Projection: dotted, draws after the real line. */}
            {hasProjection && (
              <Line
                dataKey="projection"
                name="Projection"
                stroke="var(--accent)"
                strokeOpacity={0.6}
                strokeWidth={2}
                strokeDasharray="2 4"
                dot={false}
                animationBegin={DRAW_MS}
                animationDuration={600}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5 bg-accent" />
          {thisName}
        </span>
        {hasProjection && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 border-t-2 border-dotted border-accent opacity-60" />
            Projection
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-5 border-t-2 border-dashed"
            style={{ borderColor: LAST_MONTH_COLOR }}
          />
          {lastName}
        </span>
      </div>

      {/* Biggest expenses (full screen only) */}
      {!compact && items.length > 0 && (
        <div className="rounded-xl border border-line p-3">
          <h3 className="mb-2 text-sm font-semibold">Biggest expenses this month</h3>
          <ul className="space-y-2">
            {items.slice(0, shown).map((it, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {it.label}
                  {it.sub && <span className="block text-xs text-muted">{it.sub}</span>}
                </span>
                <span className="tabular-nums">{eur(it.value)}</span>
              </li>
            ))}
          </ul>
          {items.length > 5 && (
            <button
              type="button"
              onClick={() =>
                setShown(shown >= items.length ? 5 : Math.min(items.length, shown + 5))
              }
              className="mt-2 text-xs text-accent"
            >
              {shown >= items.length ? "Show less" : `Show more (${items.length - shown} left)`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
