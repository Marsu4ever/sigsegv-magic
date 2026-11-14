"use client";
/**
 * "Activity" tab — every transaction, with search, filters and sort. Owner: UI person.
 * Data: GET /api/transactions (lib/data/home.ts → searchTransactions): the same transaction
 * rows and the same income / spending rules as the rest of the app; filtering happens on the
 * server, the phone gets one page at a time ("Show more").
 *
 * Controls (compact: search box, one row of chips, one All / Income / Expenses switch):
 *   Period    — a month (default: the latest; ‹ › or a sideways swipe), last 3 months, this year,
 *               all time, or custom dates
 *   Category  — one transaction category, with how many there are in the period
 *   Sort      — newest or oldest first
 *   Type      — all, income only, expenses only (moves to own savings show under "All")
 * Links can open it pre-filtered: ?month=YYYY-MM, ?category=…, ?q=…, ?type=income|expense.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { TransactionSearch } from "@/lib/types";
import { TransactionDayList } from "./TransactionList";
import { fiDate, formatValue, monthName } from "@/components/charts/format";
import { DevHeaderButton } from "@/components/DevButton";
import { BackButton } from "@/components/ui/BackButton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Icon } from "@/components/ui/Icon";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton, SkeletonGroup, SkeletonRows } from "@/components/ui/Skeleton";

const eur = (n: number) => formatValue(n, "€");
const PAGE = 50;

type Period =
  | { kind: "month"; month: string | null } // null = the latest month with data
  | { kind: "range"; from: string; to: string; label: string }
  | { kind: "all" };
type TypeFilter = "all" | "income" | "expense";
type Filters = { q: string; category: string; type: TypeFilter; period: Period; sort: "newest" | "oldest" };

/** "2026-09" + 1 → "2026-10". */
function shiftMonth(ym: string, by: number): string {
  const [y, m] = ym.split("-").map(Number);
  const i = y * 12 + (m - 1) + by;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}
const monthLabel = (ym: string) => `${monthName(`${ym}-01`)} ${ym.slice(0, 4)}`;

function queryString(f: Filters, offset: number): string {
  const p = new URLSearchParams();
  if (f.period.kind === "month") p.set("month", f.period.month ?? "latest");
  if (f.period.kind === "range") {
    p.set("from", f.period.from);
    p.set("to", f.period.to);
  }
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.category) p.set("category", f.category);
  if (f.type !== "all") p.set("type", f.type);
  p.set("sort", f.sort);
  p.set("offset", String(offset));
  p.set("limit", String(PAGE));
  return p.toString();
}

async function fetchPage(qs: string): Promise<TransactionSearch> {
  const res = await fetch(`/api/transactions?${qs}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.detail || json.error || `HTTP ${res.status}`);
  return json as TransactionSearch;
}

/** A small filter button that opens a choice (or toggles, for sort). */
function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium ${
        active ? "border-accent bg-accent/10 text-accent" : "border-line bg-surface text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Option({ selected, onClick, label, note }: { selected: boolean; onClick: () => void; label: string; note?: string }) {
  return (
    <li className="border-b border-line last:border-0">
      <button type="button" onClick={onClick} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm">
        <span className={selected ? "font-semibold text-accent" : ""}>{label}</span>
        <span className="flex items-center gap-2 text-xs text-muted">
          {note}
          {selected && <Icon name="check" size={16} className="text-accent" />}
        </span>
      </button>
    </li>
  );
}

/**
 * The /activity route. WHY a key: Next keeps visited tabs alive (state included), so a new
 * link like ?category=Housing must start Activity fresh. Filters picked on the page don't
 * change the URL, so they never trigger this.
 */
export function ActivityRoute() {
  const params = useSearchParams();
  return <ActivityView key={params.toString()} />;
}

export function ActivityView() {
  const params = useSearchParams();
  // Opened from a link on another screen (e.g. a payment on Home) → show a back button.
  const [fromLink] = useState(() => params.toString() !== "");
  const [filters, setFilters] = useState<Filters>(() => {
    const type = params.get("type");
    const month = params.get("month");
    return {
      q: params.get("q") ?? "",
      category: params.get("category") ?? "",
      type: type === "income" || type === "expense" ? type : "all",
      period: { kind: "month", month: month && /^\d{4}-\d{2}$/.test(month) ? month : null },
      sort: "newest",
    };
  });
  // The search box updates `filters.q` a moment after typing stops (fewer requests).
  const [typed, setTyped] = useState(filters.q);
  useEffect(() => {
    const id = setTimeout(() => setFilters((f) => (f.q === typed ? f : { ...f, q: typed })), 300);
    return () => clearTimeout(id);
  }, [typed]);

  const key = useMemo(() => queryString(filters, 0), [filters]);
  const [result, setResult] = useState<{ key: string; data: TransactionSearch } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sheet, setSheet] = useState<"period" | "category" | null>(null);
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: "", to: "" });

  useEffect(() => {
    let stale = false;
    fetchPage(key)
      .then((data) => !stale && setResult({ key, data }))
      .catch((err) => !stale && setError({ key, message: err instanceof Error ? err.message : String(err) }));
    return () => {
      stale = true; // a newer filter won: drop this answer
    };
  }, [key]);

  const data = result?.data ?? null;
  const loading = result?.key !== key && error?.key !== key;
  const shownMonth =
    filters.period.kind === "month" ? (filters.period.month ?? data?.range.from.slice(0, 7) ?? null) : null;
  const firstMonth = data?.dataRange?.from.slice(0, 7);
  const lastMonth = data?.dataRange?.to.slice(0, 7);

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const goToMonth = (by: number) => {
    if (!shownMonth || !firstMonth || !lastMonth) return;
    const target = shiftMonth(shownMonth, by);
    if (target >= firstMonth && target <= lastMonth) set({ period: { kind: "month", month: target } });
  };

  // WHY swipe in month view: sideways swipes feel natural on a phone; vertical moves scroll.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start || filters.period.kind !== "month") return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) goToMonth(dx > 0 ? -1 : 1);
  };

  async function showMore() {
    if (!result || result.data.nextOffset === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await fetchPage(queryString(filters, result.data.nextOffset));
      setResult((prev) =>
        prev && prev.key === key
          ? { key, data: { ...next, transactions: [...prev.data.transactions, ...next.transactions] } }
          : prev,
      );
    } catch (err) {
      setError({ key, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoadingMore(false);
    }
  }

  const periodLabel =
    filters.period.kind === "month"
      ? shownMonth
        ? monthLabel(shownMonth)
        : "Month"
      : filters.period.kind === "range"
        ? filters.period.label
        : "All time";
  const filtered = Boolean(filters.q.trim() || filters.category || filters.type !== "all");
  const clearFilters = () => {
    setTyped("");
    set({ q: "", category: "", type: "all" });
  };

  // Period presets, counted back from the newest day in the data ("today" in this app).
  const asOf = data?.asOf;
  const thisMonth = asOf?.slice(0, 7);
  const presets: { label: string; period: Period }[] =
    asOf && thisMonth
      ? [
          { label: "This month", period: { kind: "month", month: thisMonth } },
          { label: "Last month", period: { kind: "month", month: shiftMonth(thisMonth, -1) } },
          {
            label: "Last 3 months",
            period: { kind: "range", from: `${shiftMonth(thisMonth, -2)}-01`, to: asOf, label: "Last 3 months" },
          },
          { label: "This year", period: { kind: "range", from: `${asOf.slice(0, 4)}-01-01`, to: asOf, label: asOf.slice(0, 4) } },
          { label: "All time", period: { kind: "all" } },
        ]
      : [];
  const isSelected = (p: Period) =>
    p.kind === "month" && filters.period.kind === "month"
      ? p.month === shownMonth
      : JSON.stringify(p) === JSON.stringify(filters.period);

  return (
    <div className="h-full overflow-y-auto" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header className="flex items-center justify-between gap-2 border-b border-line bg-surface px-4 py-3">
        <h1 className="flex items-center gap-1 font-semibold">
          {fromLink && <BackButton fallback="/home" />}
          Activity
        </h1>
        <DevHeaderButton />
      </header>

      <div className="space-y-3 p-4">
        {/* Search */}
        <label className="flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2">
          <Icon name="search" size={16} className="shrink-0 text-muted" />
          <input
            type="search"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Search merchant or category"
            aria-label="Search merchant or category"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          />
          {typed && (
            <button type="button" onClick={() => setTyped("")} aria-label="Clear search" className="text-muted">
              <Icon name="close" size={16} />
            </button>
          )}
        </label>

        {/* Filters: one compact row */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Chip active={filters.period.kind !== "month"} onClick={() => data && setSheet("period")}>
            <Icon name="calendar" size={14} /> {periodLabel}
          </Chip>
          <Chip active={!!filters.category} onClick={() => data && setSheet("category")}>
            {filters.category || "All categories"} <Icon name="chevron" size={12} className="rotate-90" />
          </Chip>
          <Chip onClick={() => set({ sort: filters.sort === "newest" ? "oldest" : "newest" })}>
            <Icon name={filters.sort === "newest" ? "arrow-down" : "arrow-up"} size={13} />
            {filters.sort === "newest" ? "Newest first" : "Oldest first"}
          </Chip>
        </div>
        <SegmentedControl
          ariaLabel="Income or expenses"
          value={filters.type}
          onChange={(type) => set({ type })}
          options={[
            { value: "all", label: "All" },
            { value: "income", label: "Income" },
            { value: "expense", label: "Expenses" },
          ]}
        />

        {/* Month view: ‹ September 2026 › */}
        {filters.period.kind === "month" && shownMonth && (
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => goToMonth(-1)}
              disabled={!firstMonth || shownMonth <= firstMonth || loading}
              aria-label="Previous month"
              className="flex h-11 w-11 items-center justify-center rounded-full text-accent disabled:opacity-25"
            >
              <Icon name="chevron" size={22} className="rotate-180" />
            </button>
            <p className="text-base font-semibold">{monthLabel(shownMonth)}</p>
            <button
              type="button"
              onClick={() => goToMonth(1)}
              disabled={!lastMonth || shownMonth >= lastMonth || loading}
              aria-label="Next month"
              className="flex h-11 w-11 items-center justify-center rounded-full text-accent disabled:opacity-25"
            >
              <Icon name="chevron" size={22} />
            </button>
          </div>
        )}

        {error?.key === key && (
          <p className="flex items-start gap-2 text-sm text-danger">
            <Icon name="alert" size={18} className="mt-0.5 shrink-0" /> {error.message}
          </p>
        )}

        {!data && !error && (
          <SkeletonGroup className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-16 rounded-2xl" />
              <Skeleton className="h-16 rounded-2xl" />
            </div>
            <div className="overflow-hidden rounded-2xl bg-surface shadow-sm">
              <SkeletonRows rows={8} />
            </div>
          </SkeletonGroup>
        )}

        {data && (
          <div className={`space-y-3 transition-opacity ${loading ? "opacity-50" : ""}`}>
            {/* Money in / out of what's shown — the same rules as Home */}
            <div className="grid grid-cols-2 gap-3">
              <section className="rounded-2xl bg-surface px-4 py-3 shadow-sm">
                <p className="text-xs text-muted">Money in</p>
                <p className={`mt-0.5 text-lg font-semibold tabular-nums ${data.incomeEur > 0 ? "text-money-in" : ""}`}>
                  {data.incomeEur > 0 ? `+${eur(data.incomeEur)}` : eur(0)}
                </p>
              </section>
              <section className="rounded-2xl bg-surface px-4 py-3 shadow-sm">
                <p className="text-xs text-muted">Money out</p>
                <p className={`mt-0.5 text-lg font-semibold tabular-nums ${data.spendingEur > 0 ? "text-money-out" : ""}`}>
                  {eur(data.spendingEur > 0 ? -data.spendingEur : 0)}
                </p>
              </section>
            </div>

            <div className="flex items-baseline justify-between px-1 text-xs text-muted">
              <span>
                {data.count} transaction{data.count === 1 ? "" : "s"}
                {filters.period.kind !== "month" && ` · ${fiDate(data.range.from)} – ${fiDate(data.range.to)}`}
              </span>
              {filtered && (
                <button type="button" onClick={clearFilters} className="font-medium text-accent">
                  Clear filters
                </button>
              )}
            </div>

            <div className="overflow-hidden rounded-2xl bg-surface shadow-sm">
              {data.transactions.length > 0 ? (
                <TransactionDayList txs={data.transactions} today={data.asOf} />
              ) : (
                <p className="p-4 text-sm text-muted">
                  {filtered ? "Nothing matches these filters." : "No transactions in this period."}
                </p>
              )}
              {data.nextOffset !== null && (
                <button
                  type="button"
                  onClick={showMore}
                  disabled={loadingMore}
                  className="w-full border-t border-line py-2.5 text-xs font-medium text-accent disabled:opacity-50"
                >
                  {loadingMore ? "Loading…" : `Show more (${data.count - data.transactions.length} left)`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {sheet === "period" && data && (
        <BottomSheet label="Filter" title="Period" onClose={() => setSheet(null)}>
          <ul className="mt-3 overflow-hidden rounded-xl bg-surface shadow-sm">
            {presets.map((p) => (
              <Option
                key={p.label}
                label={p.label}
                selected={isSelected(p.period)}
                onClick={() => {
                  set({ period: p.period });
                  setSheet(null);
                }}
              />
            ))}
          </ul>
          {/* Custom dates, limited to the days that have data */}
          <h3 className="mb-1.5 mt-4 px-1 text-xs font-semibold uppercase tracking-wide text-muted">Custom dates</h3>
          <div className="flex items-end gap-2">
            <label className="flex-1 text-xs text-muted">
              From
              <input
                type="date"
                value={custom.from}
                min={data.dataRange?.from}
                max={data.dataRange?.to}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-line bg-surface px-2 py-2 text-sm text-foreground"
              />
            </label>
            <label className="flex-1 text-xs text-muted">
              To
              <input
                type="date"
                value={custom.to}
                min={data.dataRange?.from}
                max={data.dataRange?.to}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-line bg-surface px-2 py-2 text-sm text-foreground"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={!custom.from || !custom.to}
            onClick={() => {
              const [from, to] = custom.from <= custom.to ? [custom.from, custom.to] : [custom.to, custom.from];
              set({ period: { kind: "range", from, to, label: `${fiDate(from)} – ${fiDate(to)}` } });
              setSheet(null);
            }}
            className="mt-3 w-full rounded-full bg-accent py-3 text-sm font-semibold text-accent-foreground disabled:opacity-40"
          >
            Show these dates
          </button>
        </BottomSheet>
      )}

      {sheet === "category" && data && (
        <BottomSheet label="Filter" title="Category" onClose={() => setSheet(null)}>
          <p className="mt-1 text-xs text-muted">Categories with transactions in this period, and how many.</p>
          <ul className="mt-3 max-h-[55dvh] overflow-y-auto rounded-xl bg-surface shadow-sm">
            <Option
              label="All categories"
              selected={!filters.category}
              onClick={() => {
                set({ category: "" });
                setSheet(null);
              }}
            />
            {data.categories.map((c) => (
              <Option
                key={c.name}
                label={c.name}
                note={String(c.count)}
                selected={filters.category === c.name}
                onClick={() => {
                  set({ category: c.name });
                  setSheet(null);
                }}
              />
            ))}
          </ul>
        </BottomSheet>
      )}
    </div>
  );
}
