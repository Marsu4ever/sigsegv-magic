"use client";
/**
 * Draws any ChartSpec (bar / line / pie / table). Owner: UI person.
 * Used both in the small chat card and in full screen — `compact` switches
 * between the two.
 *
 * WHY Recharts: React-friendly, covers the chart types we need, well known.
 * WHY one renderer: a new chart type is added here once and works everywhere.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartSpec } from "@/lib/types";
import { basketColor, colorFor } from "./colors";
import { BasketsChart } from "./Baskets";
import { HeatmapExplorer, HeatmapPreview } from "./Heatmap";
import { CumulativeChart } from "./Cumulative";

export function formatValue(value: number, unit: string): string {
  return unit === "€"
    ? value.toLocaleString("fi-FI", { style: "currency", currency: "EUR" })
    : `${value} ${unit}`;
}

/**
 * Shorten ISO dates on axes (Finnish style):
 * daily/weekly "2026-11-03" → "3.11." · monthly "2026-11-01" → "11/26".
 * WHY: monthly data spans years, so the year must show or months repeat.
 */
function shortLabel(label: string, monthly: boolean): string {
  const m = label.match(/^\d{2}(\d{2})-(\d{2})-(\d{2})$/);
  if (!m) return label;
  return monthly ? `${Number(m[2])}/${m[1]}` : `${Number(m[3])}.${Number(m[2])}.`;
}

function isMonthly(rows: { label: string }[]): boolean {
  return rows.length > 1 && rows.every((r) => /^\d{4}-\d{2}-01$/.test(r.label));
}

export function ChartRenderer({ spec, compact }: { spec: ChartSpec; compact: boolean }) {
  if (spec.rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">No data for this period.</p>;
  }
  if (spec.type === "heatmap") {
    return compact ? <HeatmapPreview spec={spec} /> : <HeatmapExplorer spec={spec} />;
  }
  if (spec.type === "cumulative") return <CumulativeChart spec={spec} compact={compact} />;
  if (spec.type === "baskets") return <BasketsChart spec={spec} compact={compact} />;

  const monthly = isMonthly(spec.rows);
  // Two series side by side (e.g. "You" vs "Typical")? Only when rows have value2.
  const twoSeries = spec.rows.some((r) => r.value2 !== undefined);
  const [name1, name2] = spec.seriesNames ?? ["A", "B"];

  if (spec.type === "table") {
    const rows = compact ? spec.rows.slice(0, 5) : spec.rows;
    return (
      <table className="w-full text-sm">
        {twoSeries && (
          <thead className="text-xs text-muted">
            <tr>
              <th />
              <th className="text-right font-normal">{name1}</th>
              <th className="text-right font-normal">{name2}</th>
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              <td className="py-1.5 pr-2">{shortLabel(r.label, monthly)}</td>
              <td className="py-1.5 text-right tabular-nums">{formatValue(r.value, spec.unit)}</td>
              {twoSeries && (
                <td className="py-1.5 pl-2 text-right tabular-nums text-muted">
                  {formatValue(r.value2 ?? 0, spec.unit)}
                </td>
              )}
            </tr>
          ))}
          {compact && spec.rows.length > 5 && (
            <tr>
              <td colSpan={twoSeries ? 3 : 2} className="pt-1.5 text-xs text-muted">
                +{spec.rows.length - 5} more — tap to see all
              </td>
            </tr>
          )}
        </tbody>
      </table>
    );
  }

  // WHY: Recharts reads `fill` from each data row, so colors travel with the data.
  // Pie slices each get their own color; bars are one color (multi-colored
  // bars look meaningful when they aren't) — except baskets, which keep theirs.
  const data = spec.rows
    .filter((r) => spec.type !== "pie" || r.value > 0) // zero-size slices render as glitches
    .map((r, i) => ({
      ...r,
      label: shortLabel(r.label, monthly),
      // WHY no per-row fill with two series: it would paint both bars the same color.
      ...(twoSeries
        ? {}
        : {
            fill:
              spec.type === "pie"
                ? colorFor(r.label, i)
                : (basketColor(r.label) ?? "var(--accent)"),
          }),
    }));
  const SECOND_COLOR = "#a9b1a9";
  const tiltLabels =
    !compact && data.length > 5 && data.length <= 12 && data.some((d) => d.label.length > 6);
  const height = compact ? 160 : 340;
  // WHY styled: Recharts' default tooltip is a white box, which glares in dark mode.
  const tooltip = (
    <Tooltip
      formatter={(v) => formatValue(Number(v), spec.unit)}
      contentStyle={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        color: "var(--foreground)",
      }}
      labelStyle={{ color: "var(--muted)" }}
      cursor={{ fill: "var(--line)", fillOpacity: 0.5 }}
    />
  );

  return (
    <div>
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          {spec.type === "pie" ? (
            <PieChart accessibilityLayer={false}>
              <Pie
                data={data}
                dataKey="value"
                nameKey="label"
                innerRadius="45%"
                outerRadius="85%"
                isAnimationActive={false}
              />
              {tooltip}
            </PieChart>
          ) : spec.type === "line" ? (
            <LineChart
              accessibilityLayer={false}
              data={data}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={40} />
              {tooltip}
              <Line
                dataKey="value"
                name={name1}
                stroke="var(--accent)"
                strokeWidth={2}
                dot={!compact && data.length <= 31}
              />
              {twoSeries && (
                <Line
                  dataKey="value2"
                  name={name2}
                  stroke={SECOND_COLOR}
                  strokeWidth={2}
                  dot={false}
                />
              )}
            </LineChart>
          ) : (
            <BarChart
              accessibilityLayer={false}
              data={data}
              margin={{ top: 8, right: 8, bottom: 0, left: tiltLabels ? 24 : 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                // WHY: show every label only when they fit (≤ 12 bars).
                interval={compact || data.length > 12 ? "preserveStartEnd" : 0}
                // WHY: many word labels (categories) overlap — tilt them in full screen.
                {...(tiltLabels ? { angle: -35, textAnchor: "end", height: 70 } : {})}
              />
              <YAxis tick={{ fontSize: 11 }} width={40} />
              {tooltip}
              {twoSeries ? (
                <>
                  <Bar dataKey="value" name={name1} fill="var(--accent)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="value2" name={name2} fill={SECOND_COLOR} radius={[4, 4, 0, 0]} />
                </>
              ) : (
                <Bar dataKey="value" radius={[4, 4, 0, 0]} />
              )}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      {twoSeries && spec.type !== "pie" && (
        <ul className="mt-2 flex justify-center gap-4 text-xs">
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--accent)" }} />
            {name1}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: SECOND_COLOR }} />
            {name2}
          </li>
        </ul>
      )}
      {spec.type === "pie" && (
        // WHY a plain HTML legend: readable on small screens, wraps nicely.
        <ul className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs">
          {data.map((d) => (
            <li key={d.label} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.fill }} />
              {d.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
