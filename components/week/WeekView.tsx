"use client";
/**
 * "This week" tab — simple overview, no AI. Owner: UI person.
 * Data comes from GET /api/week (lib/data/index.ts → getWeekSummary).
 *
 * NOTE: shows the LAST 7 DAYS in the dataset (ending on its latest day), not the
 * real calendar week — the data is synthetic and ends mid-week. See getWeekSummary().
 *
 * LAYOUT (team call — calmer, fewer boxes):
 *   1. hero: total spent + one bar split into the 3 types of expense
 *   2. by day: stacked bars in the same 3 colours (no extra legend, no tooltip)
 *   Tap a type — in the top card, a "By day" bar or a top category — and
 *   everything else fades (bar, days, categories), so you see where that type
 *   of spending is. Tap it again, or anywhere else, to show all.
 *   3. top categories: podium medals 🥇🥈🥉 (1st also gets a flickering 🔥,
 *      Duolingo-style), a thin bar in its type colour. No multicoloured icons
 *      here (team call: the page felt too colourful).
 * COLOURS: "50 shades of green" (team call) — everything is a shade of the app's
 * green (--accent), mixed lighter or darker, so the page feels calm and on-brand
 * and works in light and dark mode. The 3 types are deep / mid / light green.
 */
import { useEffect, useState } from "react";

/** How much the non-selected types fade when one type is tapped. */
const FADED = 0.18;
const fade = (focus: Basket | null, b: Basket) => (focus && focus !== b ? FADED : 1);
import type { Basket, WeekSummary } from "@/lib/types";
import { BASKETS } from "@/lib/types";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { fiDate, formatValue } from "@/components/charts/format";
import { DevHeaderButton } from "@/components/DevButton";
import { CountUp } from "@/components/ui/CountUp";

const TYPE_COLOR: Record<Basket, string> = {
  mandatory_regular: "color-mix(in srgb, var(--accent) 62%, black)", // deep green
  mandatory_irregular: "var(--accent)", // the app's green
  everyday: "color-mix(in srgb, var(--accent) 62%, white)", // light green
};
/** Soft green tints for cards and bar backgrounds. */
const CARD_TINT = "color-mix(in srgb, var(--accent) 6%, var(--surface))";
const TRACK = "color-mix(in srgb, var(--accent) 14%, var(--surface))";

// WHY short names here (team call): "Mandatory &" made the labels long and
// heavy; Regular / Irregular / Everyday says the same on a phone.
const TYPE_LABEL: Record<Basket, string> = {
  mandatory_regular: "Regular",
  mandatory_irregular: "Surprising expenses",
  everyday: "Everyday",
};

const eur0 = (n: number) =>
  n.toLocaleString("fi-FI", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function WeekView() {
  const [data, setData] = useState<WeekSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The tapped type of expense (null = show everything).
  const [focus, setFocus] = useState<Basket | null>(null);

  useEffect(() => {
    fetch("/api/week")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.detail || json.error);
        setData(json);
      })
      .catch((err) => setError(String(err.message ?? err)));
  }, []);

  const toggle = (b: Basket) => setFocus(focus === b ? null : b);
  // A tap anywhere that isn't a type selector clears the selection.
  const clearOnOutsideTap = (e: React.MouseEvent) => {
    const target = e.target as Element;
    if (!target.closest("[data-type-select], .recharts-bar-rectangle")) setFocus(null);
  };

  return (
    <div className="h-full overflow-y-auto" onClick={focus ? clearOnOutsideTap : undefined}>
      {/* Title on the left, dates on the right, same size (team call: far apart).
          On phones the 🛠 team-hub link sits after the dates (components/DevButton.tsx). */}
      <header className="flex items-baseline justify-between gap-4 border-b border-line bg-surface px-4 py-3">
        <h1 className="font-semibold">Last 7 days</h1>
        <div className="flex items-center gap-2">
          {data && (
            <span className="text-muted tabular-nums">
              {fiDate(data.range.from)} – {fiDate(data.range.to)}
            </span>
          )}
          <DevHeaderButton />
        </div>
      </header>

      <div className="space-y-3 p-4">
        {error && <p className="text-sm text-danger">⚠️ {error}</p>}
        {!data && !error && <p className="text-sm text-muted">Loading…</p>}

        {data && (
          <>
            <Hero data={data} focus={focus} onFocus={toggle} />
            <ByDay rows={data.byDayBasket} focus={focus} onFocus={toggle} />
            <TopCategories data={data} focus={focus} onFocus={toggle} />
          </>
        )}
      </div>
    </div>
  );
}

/** Total spent + one bar split into the 3 types, with their amounts under it. */
function Hero({
  data,
  focus,
  onFocus,
}: {
  data: WeekSummary;
  focus: Basket | null;
  onFocus: (b: Basket) => void;
}) {
  const total = data.totalSpentEur || 1;
  const shown = BASKETS.filter((b) => data.byBasket[b] > 0);
  return (
    <section className="rounded-2xl p-4 shadow-sm" style={{ background: CARD_TINT }}>
      {/* "Spent" stays right above the number; both centred (team call). */}
      <div className="text-center">
        <p className="text-xs text-muted">Spent</p>
        <p className="text-4xl font-bold tracking-tight text-accent tabular-nums">
          <CountUp value={data.totalSpentEur} format={(n) => formatValue(n, "€")} duration={800} fixedWidth />
        </p>
      </div>

      <div
        className="mt-3 flex h-3 w-full gap-0.5 overflow-hidden rounded-full"
        style={{ background: TRACK }}
      >
        {shown.map((b) => (
          // Tap a piece of the bar → highlight that type (same as the labels below).
          <button
            key={b}
            type="button"
            onClick={() => onFocus(b)}
            aria-label={`Highlight ${TYPE_LABEL[b]}`}
            data-type-select
            className="h-full cursor-pointer transition-opacity duration-300"
            style={{
              width: `${(data.byBasket[b] / total) * 100}%`,
              background: TYPE_COLOR[b],
              opacity: fade(focus, b),
            }}
          />
        ))}
      </div>

      <div className="-mx-2 mt-2 grid grid-cols-3 gap-1">
        {BASKETS.map((b) => {
          const on = focus === b;
          return (
            // Tap to highlight this type everywhere on the page.
            <button
              key={b}
              type="button"
              onClick={() => onFocus(b)}
              aria-pressed={on}
              data-type-select
              className={`rounded-lg px-2 py-1 text-left transition-all duration-300 ${
                data.byBasket[b] > 0 ? "" : "opacity-50"
              } ${focus && !on ? "opacity-40" : ""}`}
              style={on ? { boxShadow: `inset 0 0 0 2px ${TYPE_COLOR[b]}` } : undefined}
            >
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLOR[b] }} />
                {TYPE_LABEL[b]}
              </div>
              <div className="text-sm font-semibold tabular-nums">{eur0(data.byBasket[b])}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Round numbers for the € axis: 0, half, top (e.g. 0 / 200 / 400). */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0];
  const step = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].find((s) => s * 2 >= max) ?? 10000;
  return [0, step, step * 2];
}

/** Each day as one bar, stacked in the 3 type colours. No tooltip (team call). */
function ByDay({
  rows,
  focus,
  onFocus,
}: {
  rows: WeekSummary["byDayBasket"];
  focus: Basket | null;
  onFocus: (b: Basket) => void;
}) {
  const max = Math.max(0, ...rows.map((r) => BASKETS.reduce((s, b) => s + r[b], 0)));
  const ticks = niceTicks(max);
  // Non-breaking space keeps "2000 €" on one line; the axis grows to fit the longest label.
  const tickLabel = (v: number) => `${v}\u00a0€`;
  const yAxisWidth = Math.max(36, Math.ceil(tickLabel(ticks[ticks.length - 1]).length * 6.5) + 8);
  return (
    <section className="rounded-2xl p-4 shadow-sm" style={{ background: CARD_TINT }}>
      <h2 className="mb-3 text-sm font-semibold">By day</h2>
      <div style={{ width: "100%", height: 180 }}>
        <ResponsiveContainer>
          <BarChart
            accessibilityLayer={false}
            data={rows}
            margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
            barCategoryGap="28%"
          >
            <CartesianGrid vertical={false} stroke={TRACK} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--muted)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              ticks={ticks}
              domain={[0, ticks[ticks.length - 1]]}
              tick={{ fontSize: 11, fill: "var(--muted)" }}
              tickFormatter={tickLabel}
              axisLine={false}
              tickLine={false}
              width={yAxisWidth}
            />
            {BASKETS.map((b, i) => (
              <Bar
                key={b}
                dataKey={b}
                name={TYPE_LABEL[b]}
                stackId="day"
                fill={TYPE_COLOR[b]}
                fillOpacity={fade(focus, b)}
                // Tap a coloured piece of a bar → highlight that type.
                onClick={() => onFocus(b)}
                cursor="pointer"
                // Round only the top of the stack.
                radius={i === BASKETS.length - 1 ? [6, 6, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

const MEDALS = ["🥇", "🥈", "🥉"];

/** Top categories: podium medals, name, amount; a thin bar in its type colour shows the size. */
function TopCategories({
  data,
  focus,
  onFocus,
}: {
  data: WeekSummary;
  focus: Basket | null;
  onFocus: (b: Basket) => void;
}) {
  const max = data.topCategories[0]?.value || 1;
  return (
    <section className="rounded-2xl p-4 shadow-sm" style={{ background: CARD_TINT }}>
      <h2 className="mb-3 text-sm font-semibold">Top categories</h2>
      <ul className="space-y-3">
        {data.topCategories.map((r, i) => {
          const type = data.topCategoryBaskets[i] ?? "everyday";
          const color = TYPE_COLOR[type];
          return (
            // Tap a category → highlight its type of expense.
            <li
              key={r.label}
              role="button"
              tabIndex={0}
              data-type-select
              onClick={() => onFocus(type)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onFocus(type)}
              className="flex cursor-pointer items-center gap-3 transition-opacity duration-300"
              style={{ opacity: fade(focus, type) }}
            >
              {/* Medal for the podium, a quiet number after that. */}
              <span className="flex w-8 shrink-0 justify-center text-2xl leading-none">
                {MEDALS[i] ?? (
                  // Same size as a medal, so 4th, 5th… line up and are easy to see.
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-line text-xs font-bold text-foreground/70 tabular-nums">
                    {i + 1}
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-1 font-medium">
                    <span className="truncate">{r.label}</span>
                    {/* 1st place is "on fire", like a Duolingo streak. */}
                    {i === 0 && (
                      <span className="flame-flicker" aria-label="top spending category">
                        🔥
                      </span>
                    )}
                  </span>
                  <span className="font-semibold tabular-nums">{formatValue(r.value, "€")}</span>
                </div>
                <div
                  className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
                  style={{ background: TRACK }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(3, (r.value / max) * 100)}%`, background: color }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
