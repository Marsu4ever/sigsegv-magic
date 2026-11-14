"use client";
/**
 * Spending heatmap — a GitHub-style calendar of DAILY spending.
 * Columns = Mon…Sun, rows = weeks, one month at a time. Owner: UI person.
 *
 * - <HeatmapPreview>: small, read-only version shown in a chat card.
 * - <HeatmapExplorer>: full screen. Switch months with ‹ ›. Hover a day (mouse)
 *   for a quick popup of its biggest purchases; click/tap it for the full list
 *   (both fetched from /api/day and cached per day).
 *
 * Input: ChartSpec rows with one row per day, label "YYYY-MM-DD"
 * (show_chart makes these with spend_over_time, group_by "day").
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Basket, ChartRow, ChartSpec, DaySpending } from "@/lib/types";
import { BASKET_LABELS } from "@/lib/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
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
// Level 0 = no spending, 1–4 = more and more (like GitHub's greens).
const LEVEL_COLORS = ["var(--line)", "#c3e6d5", "#7fcca6", "#2fa877", "var(--accent)"];
const BASKET_DOT: Record<Basket, string> = {
  mandatory_regular: "var(--basket-regular)",
  mandatory_irregular: "var(--basket-irregular)",
  everyday: "var(--basket-everyday)",
};

// Fits in a calendar cell: "84 €", "613 €", "1,2k €". WHY whole euros: cents don't fit.
const shortEur = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(1).replace(".", ",")}k €` : `${Math.round(n)} €`;
const eur = (n: number) => n.toLocaleString("fi-FI", { style: "currency", currency: "EUR" });

// ─── Date helpers (UTC, "YYYY-MM-DD" strings) ───────────────────────────
const toDate = (s: string) => new Date(s + "T00:00:00Z");
const iso = (d: Date) => d.toISOString().slice(0, 10);
function addDays(s: string, n: number) {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}
function mondayOf(s: string) {
  const day = toDate(s).getUTCDay(); // 0 = Sunday
  return addDays(s, day === 0 ? -6 : 1 - day);
}
function lastDayOfMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return iso(new Date(Date.UTC(y, m, 0)));
}
function shiftMonth(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return iso(d).slice(0, 7);
}
function monthName(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/**
 * Spending level 0–4 for each amount.
 * WHY quartiles of all spending days: a few huge days (rent) would otherwise
 * make every other day look empty.
 */
function makeLevels(rows: ChartRow[]) {
  const vals = rows
    .map((r) => r.value)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const q = (p: number) => vals[Math.floor(p * (vals.length - 1))] ?? 0;
  const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
  return (v: number) => (v <= 0 ? 0 : v <= q1 ? 1 : v <= q2 ? 2 : v <= q3 ? 3 : 4);
}

// ─── One month grid ──────────────────────────────────────────────────────
function MonthGrid({
  month,
  byDate,
  level,
  cell,
  selected,
  onSelect,
  onHover,
  showAmounts,
}: {
  month: string; // "YYYY-MM"
  byDate: Map<string, number>;
  level: (v: number) => number;
  cell: number; // px
  selected?: string;
  onSelect?: (date: string) => void;
  onHover?: (date: string | null, cell: HTMLElement | null) => void;
  showAmounts?: boolean; // euros inside each day (full screen only — too small in chat)
}) {
  const first = `${month}-01`;
  const last = lastDayOfMonth(month);
  const weeks: string[] = [];
  for (let w = mondayOf(first); w <= last; w = addDays(w, 7)) weeks.push(w);
  const gap = Math.max(2, Math.round(cell / 9));

  // WHY weekdays across the top (team decision): reads like a normal calendar —
  // Mon…Sun left to right, one row per week.
  return (
    <div className="flex flex-col" style={{ gap }}>
      <div
        className="flex text-center text-muted"
        style={{ gap, fontSize: Math.max(9, cell / 3.4) }}
      >
        {WEEKDAYS.map((d) => (
          <div key={d} style={{ width: cell }}>
            {cell >= 28 ? d : d[0]}
          </div>
        ))}
      </div>
      {weeks.map((monday) => (
        <Fragment key={monday}>
          <div className="flex" style={{ gap }}>
            {WEEKDAYS.map((_, i) => {
              const date = addDays(monday, i);
              const inMonth = date >= first && date <= last;
              if (!inMonth) return <div key={date} style={{ width: cell, height: cell }} />;
              const v = byDate.get(date);
              const hasData = v !== undefined;
              const isSel = date === selected;
              // WHY a <div> when not clickable: the preview sits inside the chat
              // card's <button>, and a button inside a button is invalid HTML.
              const Cell = onSelect ? "button" : "div";
              return (
                <Cell
                  key={date}
                  {...(onSelect
                    ? {
                        type: "button" as const,
                        disabled: !hasData,
                        onClick: () => onSelect(date),
                        "aria-label": hasData ? `${date}, spent ${eur(v!)}` : `${date}, no data`,
                      }
                    : {})}
                  // WHY mouse only: on phones a tap already opens the full
                  // list, a hover popup would just flash.
                  onPointerEnter={(e: React.PointerEvent<HTMLElement>) =>
                    hasData && e.pointerType === "mouse" && onHover?.(date, e.currentTarget)
                  }
                  onPointerLeave={() => onHover?.(null, null)}
                  title={onHover ? undefined : hasData ? `${date}: ${eur(v!)}` : `${date}: no data`}
                  className="relative flex items-center justify-center rounded"
                  style={{
                    width: cell,
                    height: cell,
                    background: hasData ? LEVEL_COLORS[level(v!)] : "transparent",
                    border: hasData ? "none" : "1px dashed var(--line)",
                    outline: isSel ? "2px solid var(--foreground)" : "none",
                    outlineOffset: 1,
                    fontSize: cell >= 28 ? 11 : 0,
                    color: hasData && level(v!) >= 3 ? "white" : "var(--muted)",
                  }}
                >
                  {showAmounts ? (
                    <>
                      {/* Day number small in the corner, euros big in the middle. */}
                      <span className="absolute left-1 top-0.5 text-[10px] leading-none opacity-80">
                        {Number(date.slice(8))}
                      </span>
                      {hasData && v! > 0 && (
                        <span
                          className="font-semibold tabular-nums"
                          style={{
                            fontSize: Math.min(14, cell / 4.2),
                            color: level(v!) >= 3 ? "white" : "var(--foreground)",
                          }}
                        >
                          {shortEur(v!)}
                        </span>
                      )}
                    </>
                  ) : (
                    Number(date.slice(8))
                  )}
                </Cell>
              );
            })}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

function dayTitle(date: string) {
  return `${WEEKDAYS[(toDate(date).getUTCDay() + 6) % 7]} ${Number(date.slice(8))}.${Number(
    date.slice(5, 7),
  )}.${date.slice(0, 4)}`;
}

/**
 * One day's purchases as horizontal bars, biggest first (the API sorts them).
 * WHY bars behind the rows: you see at a glance which purchase made the day
 * expensive. Bar length is relative to the day's biggest purchase.
 */
function DayBars({ day, limit }: { day: DaySpending; limit?: number }) {
  const list = limit ? day.transactions.slice(0, limit) : day.transactions;
  const max = day.transactions[0]?.amountEur || 1;
  return (
    <ul className="space-y-1 text-sm">
      {list.map((t, i) => (
        <li key={i} className="relative overflow-hidden rounded-md px-2 py-1">
          <span
            className="absolute inset-y-0 left-0 rounded-md opacity-25"
            style={{
              width: `${Math.max(4, (t.amountEur / max) * 100)}%`,
              background: BASKET_DOT[t.basket],
            }}
          />
          <span className="relative flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: BASKET_DOT[t.basket] }}
                title={BASKET_LABELS[t.basket]}
              />
              <span className="truncate">
                {t.category}
                {t.merchantType && <span className="text-xs text-muted"> · {t.merchantType}</span>}
              </span>
            </span>
            <span className="shrink-0 font-medium tabular-nums">{eur(t.amountEur)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

const HOVER_TOP = 7; // purchases shown in the hover popup
const LIST_STEP = 7; // purchases per "page" in the click list

/** Full list after a click: 7 purchases, "Show more" opens 7 more below. */
function DayList({ day }: { day: DaySpending }) {
  const [shown, setShown] = useState(LIST_STEP);
  const left = day.transactions.length - shown;
  return (
    <>
      <DayBars day={day} limit={shown} />
      {(left > 0 || shown > LIST_STEP) && (
        <button
          type="button"
          onClick={() => setShown(left > 0 ? shown + LIST_STEP : LIST_STEP)}
          className="mt-2 w-full rounded-lg border border-line py-1.5 text-sm text-accent"
        >
          {left > 0 ? `Show more (${left} left)` : "Show less"}
        </button>
      )}
    </>
  );
}

const POPUP_W = 280; // px

/** The month's total, highlighted in the app's green. Used by both calendars. */
function MonthTotal({ value, big }: { value: number; big?: boolean }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full bg-accent/10 font-bold text-accent tabular-nums ${
        big ? "mt-1 px-4 py-1 text-2xl" : "px-3 py-0.5 text-base"
      }`}
    >
      {eur(value)}
    </span>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-1 text-[11px] text-muted">
      Less
      {LEVEL_COLORS.map((c) => (
        <span key={c} className="inline-block h-3 w-3 rounded-sm" style={{ background: c }} />
      ))}
      More
    </div>
  );
}

function useHeatmapData(spec: ChartSpec) {
  return useMemo(() => {
    const byDate = new Map(spec.rows.map((r) => [r.label, r.value]));
    const dates = spec.rows.map((r) => r.label).sort();
    const firstMonth = dates[0]?.slice(0, 7) ?? "";
    const lastMonth = dates[dates.length - 1]?.slice(0, 7) ?? "";
    return { byDate, level: makeLevels(spec.rows), firstMonth, lastMonth };
  }, [spec]);
}

// ─── Shared by preview and full screen ───────────────────────────────────

/**
 * Cell size that fills the box's width (7 cells + 6 gaps across).
 * Each gap is about cell/9, so width ≈ cell × 7.8.
 */
function useCellSize(box: React.RefObject<HTMLDivElement | null>, max: number) {
  const [cell, setCell] = useState(36);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setCell(Math.max(26, Math.min(max, Math.floor(e.contentRect.width / 7.8)))),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [box, max]);
  return cell;
}

/**
 * One day's purchases from /api/day, fetched at most once per day.
 * WHY a cache: hovering across the calendar would otherwise fetch the same
 * days again and again.
 */
function useDayCache() {
  const [days, setDays] = useState<Record<string, DaySpending | { error: string }>>({});
  const requested = useRef(new Set<string>());
  const loadDay = useCallback((date: string) => {
    if (requested.current.has(date)) return;
    requested.current.add(date);
    fetch(`/api/day?date=${date}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error);
        setDays((d) => ({ ...d, [date]: json }));
      })
      .catch((e) => {
        requested.current.delete(date); // allow a retry
        setDays((d) => ({ ...d, [date]: { error: String(e.message ?? e) } }));
      });
  }, []);
  return { days, loadDay };
}

type HoverState = { date: string; left: number; top: number; above: boolean } | null;

/** Where to put the hover popup: next to the day, kept inside the box. */
function useHover(
  box: React.RefObject<HTMLDivElement | null>,
  loadDay: (date: string) => void,
  width: number,
  height: number, // rough popup height, to see if it fits below
) {
  const [hover, setHover] = useState<HoverState>(null);
  const onHover = useCallback(
    (date: string | null, cell: HTMLElement | null) => {
      if (!date || !cell || !box.current) return setHover(null);
      loadDay(date);
      const b = box.current.getBoundingClientRect();
      const c = cell.getBoundingClientRect();
      // WHY below by default (team decision): it reads like a dropdown. Only pop
      // up when there's no room below in the window and more room above.
      const roomBelow = window.innerHeight - c.bottom;
      const above = roomBelow < height && c.top > roomBelow;
      const center = c.left - b.left + c.width / 2;
      setHover({
        date,
        left: Math.min(Math.max(center - width / 2, 0), Math.max(0, b.width - width)),
        top: above ? c.top - b.top - 6 : c.bottom - b.top + 6,
        above,
      });
    },
    [box, loadDay, width, height],
  );
  return { hover, setHover, onHover };
}

function HoverPopup({
  hover,
  day,
  total,
  top,
  width,
  hint,
}: {
  hover: NonNullable<HoverState>;
  day: DaySpending | { error: string } | undefined;
  total: number;
  top: number; // how many purchases to show
  width: number;
  hint: string; // what clicking does
}) {
  return (
    <div
      className="pointer-events-none absolute z-20 rounded-xl border border-line bg-background p-2.5 text-left shadow-lg"
      style={{
        width,
        left: hover.left,
        top: hover.top,
        transform: hover.above ? "translateY(-100%)" : undefined,
      }}
    >
      <div className="mb-1 flex items-baseline justify-between px-2">
        <span className="text-sm font-semibold">{dayTitle(hover.date)}</span>
        <span className="text-sm font-semibold tabular-nums">{eur(total)}</span>
      </div>
      {!day && <p className="px-2 text-xs text-muted">Loading…</p>}
      {day && "error" in day && <p className="px-2 text-xs text-red-600">⚠️ {day.error}</p>}
      {day && !("error" in day) && (
        <>
          {day.transactions.length === 0 ? (
            <p className="px-2 text-xs text-muted">No spending this day.</p>
          ) : (
            <DayBars day={day} limit={top} />
          )}
          <p className="mt-1 px-2 text-[11px] text-muted">
            {day.transactions.length > top
              ? `+${day.transactions.length - top} more · ${hint}`
              : hint}
          </p>
        </>
      )}
    </div>
  );
}

// ─── Small preview (chat card) ───────────────────────────────────────────
const PREVIEW_TOP = 3; // purchases in the chat card's hover popup
const PREVIEW_POPUP_W = 250; // px

export function HeatmapPreview({ spec }: { spec: ChartSpec }) {
  const { byDate, level, lastMonth } = useHeatmapData(spec);
  const box = useRef<HTMLDivElement>(null);
  const cell = useCellSize(box, 56);
  const { days, loadDay } = useDayCache();
  const { hover, onHover } = useHover(box, loadDay, PREVIEW_POPUP_W, 170);
  if (!lastMonth) return <p className="py-6 text-center text-sm text-muted">No data.</p>;
  const monthRows = spec.rows.filter((r) => r.label.startsWith(lastMonth));
  const total = monthRows.reduce((sum, r) => sum + r.value, 0);
  return (
    <div className="space-y-2">
      {/* WHY the green pill: the month total is the number people look for first. */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">
          {monthName(lastMonth)} · tap to explore other months
        </span>
        <MonthTotal value={total} />
      </div>
      {/* WHY no onSelect: the whole card is a button that opens full screen, so
          a click on a day just opens it (cells stay <div>s, no nested buttons). */}
      <div ref={box} className="relative flex justify-center">
        <MonthGrid
          month={lastMonth}
          byDate={byDate}
          level={level}
          cell={cell}
          showAmounts={cell >= 36}
          onHover={onHover}
        />
        {hover && (
          <HoverPopup
            hover={hover}
            day={days[hover.date]}
            total={byDate.get(hover.date) ?? 0}
            top={PREVIEW_TOP}
            width={PREVIEW_POPUP_W}
            hint="click to open the calendar"
          />
        )}
      </div>
      <div className="flex justify-center">
        <Legend />
      </div>
    </div>
  );
}

// ─── Full-screen explorer ────────────────────────────────────────────────
export function HeatmapExplorer({ spec }: { spec: ChartSpec }) {
  const { byDate, level, firstMonth, lastMonth } = useHeatmapData(spec);
  const [month, setMonth] = useState(lastMonth);
  const [selected, setSelected] = useState<string | undefined>();
  const gridBox = useRef<HTMLDivElement>(null);
  const details = useRef<HTMLDivElement>(null);
  const cell = useCellSize(gridBox, 88);
  const { days, loadDay } = useDayCache();
  const { hover, setHover, onHover } = useHover(gridBox, loadDay, POPUP_W, 300);

  const onSelect = useCallback(
    (date: string) => {
      loadDay(date);
      setSelected(date);
      setHover(null);
      // Bring the list (below the calendar) into view.
      setTimeout(
        () =>
          details.current?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
          }),
        50,
      );
    },
    [loadDay, setHover],
  );

  const day = selected ? days[selected] : undefined;

  const monthRows = spec.rows.filter((r) => r.label.startsWith(month));
  const monthTotal = monthRows.reduce((s, r) => s + r.value, 0);
  const spendDays = monthRows.filter((r) => r.value > 0).length;

  return (
    <div className="space-y-4">
      {/* Month switcher */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, -1))}
          disabled={month <= firstMonth}
          className="rounded-full border border-line px-3 py-1 text-lg disabled:opacity-30"
          aria-label="Previous month"
        >
          ‹
        </button>
        <div className="text-center">
          <div className="font-semibold">{monthName(month)}</div>
          <MonthTotal value={monthTotal} big />
          <div className="mt-0.5 text-xs text-muted">spending on {spendDays} days</div>
        </div>
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, 1))}
          disabled={month >= lastMonth}
          className="rounded-full border border-line px-3 py-1 text-lg disabled:opacity-30"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div ref={gridBox} className="relative flex justify-center">
        <MonthGrid
          month={month}
          byDate={byDate}
          level={level}
          cell={cell}
          showAmounts
          selected={selected}
          onSelect={onSelect}
          onHover={onHover}
        />

        {/* Hover popup: quick look at the day, biggest purchases first. */}
        {hover && (
          <HoverPopup
            hover={hover}
            day={days[hover.date]}
            total={byDate.get(hover.date) ?? 0}
            top={HOVER_TOP}
            width={POPUP_W}
            hint="click to see all"
          />
        )}
      </div>
      <div className="flex justify-center">
        <Legend />
      </div>

      {/* WHY at the bottom (team decision): the calendar stays whole; the list
          opens below everything and the page scrolls to it. */}
      {selected ? (
        <DayPanel panelRef={details} selected={selected} day={day} />
      ) : (
        <p className="text-center text-sm text-muted">
          Hover a day for a quick look, tap it to see everything.
        </p>
      )}
    </div>
  );
}

/**
 * The clicked day's purchases, biggest first: 7 shown, "Show more" adds 7.
 */
function DayPanel({
  panelRef,
  selected,
  day,
}: {
  panelRef: React.RefObject<HTMLDivElement | null>;
  selected: string;
  day: DaySpending | { error: string } | undefined;
}) {
  return (
    <div
      ref={panelRef}
      className="scroll-mt-4 rounded-xl border border-line bg-surface p-3 shadow-sm"
    >
      {day && "error" in day && <p className="text-sm text-red-600">⚠️ {day.error}</p>}
      {!day && <p className="text-sm text-muted">Loading…</p>}
      {day && !("error" in day) && (
        <div>
          <div className="flex items-baseline justify-between">
            <span className="font-semibold">{dayTitle(selected)}</span>
            <span className="font-semibold tabular-nums">{eur(day.totalEur)}</span>
          </div>
          <p className="mb-2 text-xs text-muted">
            {day.transactions.length} purchase{day.transactions.length === 1 ? "" : "s"}, biggest
            first
            {day.incomeEur > 0 && (
              <span className="text-accent"> · + {eur(day.incomeEur)} income this day</span>
            )}
          </p>
          {day.transactions.length === 0 ? (
            <p className="text-sm text-muted">No spending this day. 🎉</p>
          ) : (
            <DayList key={selected} day={day} />
          )}
        </div>
      )}
    </div>
  );
}
