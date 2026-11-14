"use client";
/**
 * "Month so far" chart — running total of spending per day of the month.
 * Owner: UI person. Data: month_progress (lib/insights/monthProgress.ts).
 *
 *   solid line  = this month (draws itself when shown)
 *   dotted line = projection to month end (draws after the solid line)
 *   dashed line = last month (already there, for comparison)
 *   light blue  = average month over the last 12 months (already there)
 *
 * Full screen also shows the key numbers and the biggest expenses
 * (first 5, "Show more" adds 5 at a time — no endless list), and:
 *   - click/tap a day → the vertical line moves there, the numbers for that
 *     day are shown under the chart (default: today) and that day's purchases
 *     are highlighted in the list
 *   - no hover tooltip (team decision: it covered too much of the chart)
 *   - the expenses list can switch to a pie chart by category
 *   - ‹ › arrows → another month (fetched from /api/month-progress)
 */
import { useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartSpec } from "@/lib/types";
import { colorFor } from "./colors";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const monthName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
function shiftMonth(m: string, n: number) {
  const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

const eur = (n: number) => n.toLocaleString("fi-FI", { style: "currency", currency: "EUR" });
const LAST_MONTH_COLOR = "var(--chart-muted)"; // theme grey (app/globals.css)
const AVERAGE_COLOR = "var(--chart-average)"; // light blue
const DRAW_MS = 1400;

type SeriesKey = "actual" | "last" | "average";
const SERIES_COLOR: Record<SeriesKey, string> = {
  actual: "var(--accent)",
  last: LAST_MONTH_COLOR,
  average: AVERAGE_COLOR,
};

export function CumulativeChart({ spec, compact }: { spec: ChartSpec; compact: boolean }) {
  // Another month replaces the chart's data; null = the month the AI showed.
  const [other, setOther] = useState<ChartSpec | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const view = other ?? spec;
  const nav = view.monthNav;

  async function goTo(month: string) {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/month-progress?month=${month}`);
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
      setOther({ ...spec, ...json });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {!compact && nav && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => goTo(shiftMonth(nav.shown, -1))}
            disabled={loading || nav.shown <= nav.first}
            className="rounded-full border border-line px-3 py-1 text-lg disabled:opacity-30"
            aria-label="Previous month"
          >
            ‹
          </button>
          <div className="text-center font-semibold">
            {monthName(nav.shown)}
            {loading && <span className="ml-1 text-xs text-muted">loading…</span>}
          </div>
          <button
            type="button"
            onClick={() => goTo(shiftMonth(nav.shown, 1))}
            disabled={loading || nav.shown >= nav.last}
            className="rounded-full border border-line px-3 py-1 text-lg disabled:opacity-30"
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      )}
      {error && <p className="text-sm text-danger">⚠️ Couldn&apos;t load that month: {error}</p>}
      {/* WHY key={month}: a new month starts fresh (line draws again, day resets). */}
      <MonthChart key={nav?.shown ?? "spec"} spec={view} compact={compact} />
    </div>
  );
}

function MonthChart({ spec, compact }: { spec: ChartSpec; compact: boolean }) {
  const valid = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

  // Index of "today" = the last real (not projected) day.
  const todayIdx = spec.rows.reduce(
    (last, r, i) => (!r.projected && valid(r.value) ? i : last),
    -1,
  );
  // WHY useMemo: a new array on every render (e.g. after a click) can make the
  // lines animate again.
  const data = useMemo(
    () =>
      spec.rows.map((r, i) => ({
        label: r.label,
        actual: !r.projected && valid(r.value) ? r.value : undefined,
        // The projection starts at today's real value so the two lines connect.
        projection: (r.projected && valid(r.value)) || i === todayIdx ? r.value : undefined,
        last: r.value2,
        average: r.average,
      })),
    [spec.rows, todayIdx],
  );
  const hasAverage = spec.rows.some((r) => valid(r.average));
  const lastIdx = spec.rows.reduce((last, r, i) => (valid(r.value) ? i : last), -1);

  // The day the vertical line is on: today by default, or the clicked day.
  const [picked, setPicked] = useState<number | null>(null);
  const selIdx = picked ?? todayIdx;
  const sel = selIdx >= 0 ? spec.rows[selIdx] : undefined;
  // Did the running total go up on the picked day? (= something was bought)
  const prevVal = selIdx > 0 ? spec.rows[selIdx - 1].value : 0;
  const spentOnSel =
    !!sel && valid(sel.value) && sel.value - (valid(prevVal) ? prevVal : 0) > 0.005;

  // Tapping a box under the chart makes a glow run along that line, then fade.
  const [flash, setFlash] = useState<{ key: SeriesKey; id: number } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function flashLine(key: SeriesKey) {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash({ key, id: Date.now() });
    flashTimer.current = setTimeout(() => setFlash(null), 1700);
  }
  const hasProjection = spec.rows.some((r) => r.projected);
  const [thisName, lastName] = spec.seriesNames ?? ["This month", "Last month"];
  const facts = spec.facts ?? [];
  const items = spec.items ?? [];

  return (
    <div className="space-y-3">
      {/* Key numbers (2 in the card, all 4 in full screen) */}
      {facts.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {(compact ? facts.slice(0, 2) : facts).map((f, i, all) => (
            <div
              key={f.label}
              // An odd last box spans both columns so the grid stays even.
              className={`rounded-lg px-2.5 py-1.5 ${
                i === 0 ? "bg-accent/10 ring-1 ring-accent" : "bg-background"
              } ${i === all.length - 1 && all.length % 2 ? "col-span-2" : ""}`}
            >
              {/* WHY the first box is green: it's the green line's number
                  ("Spent so far"), so the colour links the two. */}
              <div
                className={`text-[11px] ${i === 0 ? "font-semibold text-accent" : "text-muted"}`}
              >
                {f.label}
              </div>
              <div className={`font-semibold tabular-nums ${i === 0 ? "text-accent" : ""}`}>
                {eur(f.value)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Focus boxes on click are turned off in app/globals.css. */}
      <div style={{ width: "100%", height: compact ? 170 : 300 }}>
        <ResponsiveContainer>
          <LineChart
            accessibilityLayer={false}
            data={data}
            margin={{ top: compact ? 8 : 20, right: compact ? 8 : 16, bottom: 0, left: 0 }}
            onClick={(e) => {
              // WHY by label: Recharts 3 gives the index as a string.
              const i = data.findIndex((d) => d.label === String(e?.activeLabel));
              if (!compact && i >= 0 && valid(spec.rows[i].value)) setPicked(i);
            }}
            style={compact ? undefined : { cursor: "pointer" }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={compact ? 6 : 4} />
            <YAxis tick={{ fontSize: 11 }} width={44} />
            {/* WHY an invisible tooltip: Recharts needs it to know which day was
                clicked, but showing it hid too much of the chart. */}
            <Tooltip content={() => null} cursor={false} />
            {/* The day line: "today" by default, moves to the clicked day. */}
            {sel && (
              <ReferenceLine
                x={sel.label}
                stroke={picked === null ? "var(--muted)" : "var(--foreground)"}
                strokeDasharray={picked === null ? "2 3" : undefined}
                label={
                  compact
                    ? undefined
                    : {
                        value: selIdx === todayIdx && hasProjection ? "today" : `day ${sel.label}`,
                        fontSize: 10,
                        fill: "var(--muted)",
                        position: "top",
                      }
                }
              />
            )}
            {/* The glow for a tapped box: a thick, see-through copy of the line
                that draws itself along it (Recharts' draw animation), then fades.
                WHY first: it sits under the real lines. */}
            {flash && (
              <Line
                key={flash.id}
                dataKey={flash.key}
                stroke={SERIES_COLOR[flash.key]}
                strokeOpacity={0.35}
                strokeWidth={9}
                strokeLinecap="round"
                dot={false}
                activeDot={false}
                legendType="none"
                className="chart-flash"
                animationDuration={900}
                animationEasing="ease-in-out"
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
              activeDot={false}
              isAnimationActive={false}
            />
            {/* 12-month average: light blue, also "already there". */}
            {hasAverage && (
              <Line
                dataKey="average"
                name="12-month average"
                stroke={AVERAGE_COLOR}
                strokeWidth={2}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            )}
            {/* This month: draws itself from day 1 to today. */}
            <Line
              dataKey="actual"
              name={thisName}
              stroke="var(--accent)"
              strokeWidth={2.5}
              dot={false}
              activeDot={false}
              animationDuration={DRAW_MS}
              animationEasing="ease-out"
            />
            {/* Projection: dashed green, full strength (it used to look faded),
                with a dot + amount at the month end. */}
            {hasProjection && (
              <Line
                dataKey="projection"
                name="Projection"
                stroke="var(--accent)"
                strokeWidth={2.5}
                strokeDasharray="5 4"
                dot={false}
                activeDot={false}
                animationBegin={DRAW_MS}
                animationDuration={500}
              />
            )}
            {/* A dot on the green line when the tapped day had real spending. */}
            {picked !== null && sel && !sel.projected && spentOnSel && (
              <ReferenceDot
                x={sel.label}
                y={sel.value}
                r={5}
                fill="var(--accent)"
                stroke="var(--surface)"
                strokeWidth={2}
              />
            )}
            {hasProjection && lastIdx >= 0 && (
              <ReferenceDot
                x={data[lastIdx].label}
                y={spec.rows[lastIdx].value}
                r={4}
                fill="var(--accent)"
                stroke="var(--surface)"
                label={
                  compact
                    ? undefined
                    : {
                        value: eur(spec.rows[lastIdx].value),
                        position: "left",
                        fontSize: 11,
                        fontWeight: 600,
                        fill: "var(--accent)",
                      }
                }
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
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-5 border-t-2 border-dashed"
            style={{ borderColor: LAST_MONTH_COLOR }}
          />
          {lastName}
        </span>
        {hasAverage && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-5" style={{ background: AVERAGE_COLOR }} />
            12-month average
          </span>
        )}
      </div>

      {/* The chosen day's numbers (full screen) */}
      {!compact && sel && (
        <div className="rounded-xl border border-line p-3 text-sm">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="font-semibold">
              By day {sel.label}
              {selIdx === todayIdx && hasProjection ? " (today)" : ""}
            </span>
            <span className="text-xs text-muted">tap a box to light up its line</span>
          </div>
          {/* WHY this order + the bigger middle box: this month is the point;
              last month and the average are there to compare with. */}
          <div className="flex items-stretch gap-2">
            <ReadoutBox
              label={lastName}
              value={sel.value2}
              color={SERIES_COLOR.last}
              dashed
              onTap={() => flashLine("last")}
            />
            <ReadoutBox
              label={sel.projected ? `${thisName} (projected)` : thisName}
              value={sel.value}
              color={SERIES_COLOR.actual}
              dashed={sel.projected}
              main
              onTap={() => flashLine("actual")}
            />
            {hasAverage && (
              <ReadoutBox
                label="12-month avg"
                value={sel.average}
                color={SERIES_COLOR.average}
                onTap={() => flashLine("average")}
              />
            )}
          </div>
        </div>
      )}

      {/* Biggest expenses (full screen only) — list or pie */}
      {!compact && items.length > 0 && (
        <Expenses
          items={items}
          title={`${thisName === "This month" ? "This month so far" : thisName} - Expenses`}
          pickedDay={picked !== null ? sel?.label : undefined}
        />
      )}
    </div>
  );
}

const STEP = 5;
const dayOf = (date?: string) => (date ? String(Number(date.slice(8, 10))) : "");

/**
 * The month's expenses, biggest first, 5 at a time — or a pie by category.
 * A picked day's purchases are highlighted and always shown.
 */
function Expenses({
  items,
  title,
  pickedDay,
}: {
  items: NonNullable<ChartSpec["items"]>;
  title: string;
  pickedDay?: string;
}) {
  const [shown, setShown] = useState(STEP);
  const [asPie, setAsPie] = useState(false);
  // Tapped pie slice / category row (tap again to clear).
  const [group, setGroup] = useState<string | null>(null);
  const toggleGroup = (g: string) => setGroup(group === g ? null : g);
  const isPicked = (it: (typeof items)[number]) => !!pickedDay && dayOf(it.date) === pickedDay;
  const picked = items.filter(isPicked);
  const visible = items.filter((it, i) => i < shown || isPicked(it));

  // Pie: total per category, biggest first.
  const byGroup = new Map<string, number>();
  for (const it of items)
    byGroup.set(it.group ?? it.label, (byGroup.get(it.group ?? it.label) ?? 0) + it.value);
  const slices = [...byGroup.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({
      label,
      value: Math.round(value * 100) / 100,
      fill: colorFor(label, i),
      // WHY per-slice props: Recharts copies them onto the slice, so the tapped
      // one stays bright and gets an outline while the rest fade.
      fillOpacity: group && group !== label ? 0.3 : 1,
      stroke: group === label ? "var(--foreground)" : "var(--surface)",
      strokeWidth: group === label ? 2 : 1,
    }));

  return (
    <div className="rounded-xl border border-line p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <button
          type="button"
          onClick={() => setAsPie(!asPie)}
          className="shrink-0 rounded-full border border-line px-2.5 py-0.5 text-xs text-accent"
          aria-label={asPie ? "Show as list" : "Show as pie chart"}
        >
          {asPie ? "☰ List" : "◔ Pie"}
        </button>
      </div>

      {asPie ? (
        <>
          <div style={{ width: "100%", height: 230 }}>
            <ResponsiveContainer>
              <PieChart accessibilityLayer={false}>
                {/* outerRadius 72%: leaves room for the small slices' labels outside. */}
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="40%"
                  outerRadius="72%"
                  isAnimationActive={false}
                  labelLine={false}
                  label={PieLabel}
                  onClick={(_, i) => toggleGroup(slices[i].label)}
                  style={{ cursor: "pointer" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-center text-xs text-muted">
            Tap a slice or a row to highlight it
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {slices.map((sl) => (
              <li key={sl.label}>
                <button
                  type="button"
                  onClick={() => toggleGroup(sl.label)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left ${
                    group === sl.label ? "font-semibold ring-2" : ""
                  } ${group && group !== sl.label ? "opacity-40" : ""}`}
                  style={
                    group === sl.label
                      ? {
                          background: `color-mix(in srgb, ${sl.fill} 15%, transparent)`,
                          ["--tw-ring-color" as string]: sl.fill,
                        }
                      : undefined
                  }
                >
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: sl.fill }} />
                    {sl.label}
                  </span>
                  <span className="tabular-nums">{eur(sl.value)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          {/* Days with no spending: no message (team decision) — no dot on the chart either. */}
          {pickedDay && picked.length > 0 && (
            <p className="mb-2 text-xs text-accent">
              {`Day ${pickedDay}: ${picked.length} purchase${picked.length === 1 ? "" : "s"}, ${eur(
                picked.reduce((sum, it) => sum + it.value, 0),
              )} — highlighted`}
            </p>
          )}
          <ul className="space-y-1">
            {visible.map((it, i) => (
              <li
                key={i}
                className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm ${
                  isPicked(it) ? "bg-accent/10 ring-1 ring-accent" : ""
                }`}
              >
                <span>
                  {it.label}
                  {it.sub && <span className="block text-xs text-muted">{it.sub}</span>}
                </span>
                <span className="tabular-nums">{eur(it.value)}</span>
              </li>
            ))}
          </ul>
          {items.length > STEP && (
            <button
              type="button"
              onClick={() =>
                setShown(shown >= items.length ? STEP : Math.min(items.length, shown + STEP))
              }
              className="mt-2 text-xs text-accent"
            >
              {shown >= items.length ? "Show less" : `Show more (${items.length - shown} left)`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function ReadoutBox({
  label,
  value,
  color,
  dashed,
  main,
  onTap,
}: {
  label: string;
  value: number | undefined;
  color: string;
  dashed?: boolean;
  main?: boolean; // this month: bigger and tinted
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      className={`flex min-w-0 flex-col justify-between rounded-lg px-2 text-left active:scale-[0.98] ${
        main
          ? "flex-[1.5] bg-accent/15 py-3 shadow-md ring-2 ring-accent"
          : "flex-1 bg-background py-2"
      }`}
    >
      <span
        className={`flex items-start gap-1.5 leading-tight ${
          main ? "text-xs font-semibold text-accent" : "text-[11px] text-muted"
        }`}
      >
        <span
          className={`mt-1.5 inline-block w-3 shrink-0 border-t-2 ${dashed ? "border-dashed" : ""}`}
          style={{ borderColor: color }}
        />
        <span>{label}</span>
      </span>
      <span
        className={`mt-1 tabular-nums ${main ? "text-xl font-bold text-accent" : "text-sm font-semibold"}`}
      >
        {typeof value === "number" && Number.isFinite(value) ? eur(value) : "—"}
      </span>
    </button>
  );
}

/**
 * Percent on the pie: inside big slices; small slices get a short line out to
 * a label beside the pie (they'd be unreadable inside).
 */
function PieLabel(p: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
  fill?: string;
}) {
  const { cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0 } = p;
  if (percent <= 0) return null;
  const rad = (-midAngle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const text = `${percent < 0.01 ? "<1" : Math.round(percent * 100)}%`;
  if (percent >= 0.08) {
    const r = (innerRadius + outerRadius) / 2;
    return (
      <text
        x={cx + r * cos}
        y={cy + r * sin}
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontSize={12}
        fontWeight={700}
      >
        {text}
      </text>
    );
  }
  // Line from the slice edge outwards, then a short horizontal tail.
  const x1 = cx + outerRadius * cos;
  const y1 = cy + outerRadius * sin;
  const x2 = cx + (outerRadius + 14) * cos;
  const y2 = cy + (outerRadius + 14) * sin;
  const x3 = x2 + (cos >= 0 ? 12 : -12);
  return (
    <g>
      <path
        d={`M${x1},${y1} L${x2},${y2} L${x3},${y2}`}
        stroke={p.fill ?? "var(--muted)"}
        strokeWidth={1.5}
        fill="none"
      />
      <text
        x={x3 + (cos >= 0 ? 3 : -3)}
        y={y2}
        textAnchor={cos >= 0 ? "start" : "end"}
        dominantBaseline="central"
        fill="var(--foreground)"
        fontSize={11}
        fontWeight={600}
      >
        {text}
      </text>
    </g>
  );
}
