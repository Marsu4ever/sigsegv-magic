"use client";
/**
 * Small balance-history chart for the Account tab.
 * WHY its own chart (not ChartCard): a balance should zoom in on its own range, like a
 * banking app. The shared charts start at 0, which is right for spending but makes a
 * balance between e.g. 55 000 € and 65 000 € look like a flat line.
 */
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartRow } from "@/lib/types";
import { fiDate, formatValue, shortLabel } from "@/components/charts/format";

export function BalanceChart({ rows }: { rows: ChartRow[] }) {
  const values = rows.map((r) => r.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // WHY padding: keep the line off the very top and bottom edges.
  const pad = Math.max((max - min) * 0.15, 1);
  return (
    <div style={{ width: "100%", height: 140 }}>
      <ResponsiveContainer>
        <AreaChart accessibilityLayer={false} data={rows} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tickFormatter={(d: string) => shortLabel(d, false)}
            tick={{ fontSize: 11, fill: "var(--muted)" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={40}
          />
          <YAxis hide domain={[min - pad, max + pad]} />
          <Tooltip
            formatter={(v) => [formatValue(Number(v), "€"), "Balance"]}
            labelFormatter={(d) => fiDate(String(d))}
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              color: "var(--foreground)",
            }}
            labelStyle={{ color: "var(--muted)" }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--accent)"
            strokeWidth={2}
            fill="url(#balanceFill)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
