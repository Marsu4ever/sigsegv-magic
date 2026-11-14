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

  const monthly = isMonthly(spec.rows);

  if (spec.type === "table") {
    const rows = compact ? spec.rows.slice(0, 5) : spec.rows;
    return (
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-line last:border-0">
              <td className="py-1.5 pr-2">{shortLabel(r.label, monthly)}</td>
              <td className="py-1.5 text-right tabular-nums">{formatValue(r.value, spec.unit)}</td>
            </tr>
          ))}
          {compact && spec.rows.length > 5 && (
            <tr>
              <td colSpan={2} className="pt-1.5 text-xs text-muted">
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
      fill: spec.type === "pie" ? colorFor(r.label, i) : (basketColor(r.label) ?? "var(--accent)"),
    }));
  const height = compact ? 160 : 320;
  const tooltip = <Tooltip formatter={(v) => formatValue(Number(v), spec.unit)} />;

  return (
    <div>
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          {spec.type === "pie" ? (
            <PieChart>
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
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={40} />
              {tooltip}
              <Line dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={!compact} />
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                // WHY: show every label only when they fit (≤ 12 bars).
                interval={compact || data.length > 12 ? "preserveStartEnd" : 0}
              />
              <YAxis tick={{ fontSize: 11 }} width={40} />
              {tooltip}
              <Bar dataKey="value" radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
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
