"use client";
/**
 * Spending breakdown on Home: one month of money out in the 3 baskets the challenge asks for
 * (Regular essentials, Unexpected necessities, Everyday spending). Owner: UI person.
 * Data: GET /api/spending?month= (lib/insights/spendingBreakdown.ts). Every transaction's basket
 * comes from the backend (lib/data/baskets.ts); nothing is sorted into baskets here.
 *
 * One card, no big charts (team call: don't overwhelm): month ‹ ›, total with the change vs the
 * same days of last month, money in vs money out, then one row per basket — amount, % of all
 * spending, number of payments, a thin bar. Tap a basket → its categories; tap a category →
 * its merchant types; tap one of those → its payments in a sheet.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Basket, SpendingBasket, SpendingBreakdown as Data } from "@/lib/types";
import { fiDate, formatValue, monthName, weekdayDate } from "@/components/charts/format";
import { TYPE_COLOR } from "@/components/week/WeekView";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Icon } from "@/components/ui/Icon";
import { Skeleton, SkeletonGroup, SkeletonRows } from "@/components/ui/Skeleton";

/** WHY these names here (not BASKET_LABELS): the challenge's wording, plain for customers. */
const NAME: Record<Basket, string> = {
  mandatory_regular: "Regular essentials",
  mandatory_irregular: "Unexpected necessities",
  everyday: "Everyday spending",
};

const eur = (n: number) => formatValue(n, "€");
const pct = (share: number) => `${Math.round(share * 100)} %`;
const payments = (n: number) => `${n} payment${n === 1 ? "" : "s"}`;

/** "2026-09" + 1 → "2026-10". */
function shiftMonth(ym: string, by: number): string {
  const [y, m] = ym.split("-").map(Number);
  const i = y * 12 + (m - 1) + by;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

/** ▲ 12 % / ▼ 8 %: more spending is red, less is green (spending colours, see globals.css). */
function Change({ pctChange, vs }: { pctChange: number | null; vs?: string }) {
  if (pctChange === null) return null;
  const up = pctChange > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 tabular-nums ${pctChange === 0 ? "text-muted" : up ? "text-money-out" : "text-money-in"}`}>
      {pctChange !== 0 && <Icon name={up ? "arrow-up" : "arrow-down"} size={12} strokeWidth={2.5} />}
      {pctChange === 0 ? "same" : `${Math.abs(pctChange)} %`}
      {vs && <span className="text-muted">&nbsp;{vs}</span>}
    </span>
  );
}

type Merchant = SpendingBasket["categories"][number]["merchants"][number];

function PurchasesSheet({
  merchant,
  category,
  basket,
  onClose,
}: {
  merchant: Merchant;
  category: string;
  basket: Basket;
  onClose: () => void;
}) {
  const newestFirst = [...merchant.purchases].reverse();
  return (
    <BottomSheet label={`${category} · ${NAME[basket]}`} title={merchant.name} onClose={onClose}>
      <ul className="mt-3 overflow-hidden rounded-xl bg-surface shadow-sm">
        {newestFirst.map((p, i) => (
          <li key={`${p.date}-${i}`} className="flex justify-between gap-3 border-b border-line px-4 py-2.5 text-sm last:border-0">
            <span>{weekdayDate(p.date)}</span>
            <span className="tabular-nums">{eur(-p.amount)}</span>
          </li>
        ))}
        <li className="flex justify-between gap-3 bg-surface-2 px-4 py-2.5 text-sm font-semibold">
          <span>{payments(merchant.count)}</span>
          <span className="tabular-nums">{eur(-merchant.total)}</span>
        </li>
      </ul>
      <Link
        // WHY these filters: Activity opens on exactly these payments (category + merchant type, that month).
        href={`/activity?${new URLSearchParams({
          month: newestFirst[0]?.date.slice(0, 7) ?? "",
          category,
          ...(merchant.name !== "Other" ? { q: merchant.name } : {}),
        })}`}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-line py-3 text-sm font-semibold"
      >
        <Icon name="activity" size={18} /> See them in Activity
      </Link>
    </BottomSheet>
  );
}

function BasketRow({
  b,
  open,
  onToggle,
  onMerchant,
}: {
  b: SpendingBasket;
  open: boolean;
  onToggle: () => void;
  onMerchant: (m: Merchant, category: string) => void;
}) {
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const empty = b.total === 0;
  return (
    <li className="border-t border-line first:border-0">
      <button
        type="button"
        onClick={onToggle}
        disabled={empty}
        aria-expanded={open}
        className="w-full py-3 text-left disabled:cursor-default"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: TYPE_COLOR[b.basket] }} />
            <span className="truncate">{NAME[b.basket]}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums">
            {eur(b.total)}
            {!empty && (
              <Icon name="chevron" size={14} className={`text-muted transition-transform ${open ? "rotate-90" : ""}`} />
            )}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full" style={{ width: `${b.share * 100}%`, background: TYPE_COLOR[b.basket] }} />
        </div>
        <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted">
          {empty ? (
            <span>None this month</span>
          ) : (
            <>
              <span>{pct(b.share)} of spending</span>
              <span aria-hidden>·</span>
              <span>{payments(b.count)}</span>
              {b.changePct !== null && (
                <>
                  <span aria-hidden>·</span>
                  <Change pctChange={b.changePct} />
                </>
              )}
            </>
          )}
        </div>
      </button>

      {/* Categories → merchant types → payments */}
      {open && (
        <ul className="mb-3 overflow-hidden rounded-xl bg-surface-2">
          {b.categories.map((c) => {
            const catOpen = openCategory === c.name;
            return (
              <li key={c.name} className="border-b border-line last:border-0">
                <button
                  type="button"
                  onClick={() => setOpenCategory(catOpen ? null : c.name)}
                  aria-expanded={catOpen}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm"
                >
                  {/* WHY one line: a basket can have 6+ categories; two-line rows got long. */}
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <span className="truncate font-medium">{c.name}</span>
                    <span className="shrink-0 text-xs text-muted">· {c.count}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 tabular-nums">
                    {eur(c.total)}
                    <Icon name="chevron" size={14} className={`text-muted transition-transform ${catOpen ? "rotate-90" : ""}`} />
                  </span>
                </button>
                {catOpen && (
                  <ul className="pb-1.5">
                    {c.merchants.map((m) => (
                      <li key={m.name}>
                        <button
                          type="button"
                          onClick={() => onMerchant(m, c.name)}
                          className="flex w-full items-center justify-between gap-3 py-1.5 pl-6 pr-3 text-left text-xs"
                        >
                          <span className="min-w-0 truncate text-muted">
                            {m.name} · {m.count}×
                          </span>
                          <span className="flex shrink-0 items-center gap-1 tabular-nums">
                            {eur(m.total)}
                            <Icon name="chevron" size={12} className="text-muted" />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

async function load(month?: string): Promise<Data> {
  const res = await fetch(`/api/spending${month ? `?month=${month}` : ""}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.detail || json.error || `HTTP ${res.status}`);
  return json as Data;
}

export function SpendingBreakdown() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [openBasket, setOpenBasket] = useState<Basket | null>(null);
  const [sheet, setSheet] = useState<{ merchant: Merchant; category: string; basket: Basket } | null>(null);

  useEffect(() => {
    load()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  async function goToMonth(by: number) {
    if (!data || loadingMonth) return;
    const target = shiftMonth(data.month, by);
    if (target < data.first || target > data.last) return;
    setLoadingMonth(true);
    try {
      setData(await load(target));
      setOpenBasket(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMonth(false);
    }
  }

  if (error) {
    return (
      <p className="flex items-start gap-2 rounded-2xl bg-danger-soft p-4 text-sm text-danger">
        <Icon name="alert" size={18} className="mt-0.5 shrink-0" /> Couldn&apos;t load this part. {error}
      </p>
    );
  }
  if (!data) {
    return (
      <SkeletonGroup className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <Skeleton className="mx-auto h-4 w-1/3" />
        <Skeleton className="h-8 w-1/2" />
        <SkeletonRows rows={3} />
      </SkeletonGroup>
    );
  }

  const month = monthName(`${data.month}-01`);
  const prev = data.previous;
  const vs = prev
    ? data.inProgress
      ? `vs 1.–${Number(prev.range.to.slice(8, 10))}. ${monthName(prev.range.from)}`
      : `vs ${monthName(prev.range.from)}`
    : undefined;

  return (
    <section className="rounded-2xl bg-surface px-4 pb-2 pt-3 shadow-sm">
      {/* Month: ‹ September 2026 › */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => goToMonth(-1)}
          disabled={data.month <= data.first || loadingMonth}
          aria-label="Previous month"
          className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-accent disabled:opacity-25"
        >
          <Icon name="chevron" size={20} className="rotate-180" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold">
            {month} {data.month.slice(0, 4)}
          </p>
          {data.inProgress && (
            <p className="text-[11px] text-muted">
              {fiDate(data.range.from)} – {fiDate(data.range.to)} (so far)
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => goToMonth(1)}
          disabled={data.month >= data.last || loadingMonth}
          aria-label="Next month"
          className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-accent disabled:opacity-25"
        >
          <Icon name="chevron" size={20} />
        </button>
      </div>

      <div className={`transition-opacity ${loadingMonth ? "opacity-50" : ""}`}>
        {/* Total spent + change vs last month */}
        <div className="mt-2 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs text-muted">Spent</p>
            <p className="text-2xl font-bold tabular-nums">{eur(data.spendingEur)}</p>
          </div>
          <div className="pb-1 text-right text-xs">
            {prev ? <Change pctChange={prev.changePct} vs={vs} /> : <span className="text-muted">No earlier month to compare</span>}
            {prev && <p className="text-muted tabular-nums">{eur(prev.spendingEur)} then</p>}
          </div>
        </div>

        {/* Income vs expenses: the breakdown below is money out only */}
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-surface-2 px-3 py-2">
            <p className="text-muted">Money in</p>
            <p className="text-sm font-semibold tabular-nums text-money-in">
              {data.incomeEur > 0 ? `+${eur(data.incomeEur)}` : eur(0)}
            </p>
          </div>
          <div className="rounded-xl bg-surface-2 px-3 py-2">
            <p className="text-muted">Money out · {payments(data.count)}</p>
            <p className="text-sm font-semibold tabular-nums text-money-out">{eur(-data.spendingEur)}</p>
          </div>
        </div>

        {data.spendingEur === 0 ? (
          <p className="py-4 text-center text-sm text-muted">No spending in {month}.</p>
        ) : (
          <ul className="mt-2">
            {data.baskets.map((b) => (
              <BasketRow
                key={b.basket}
                b={b}
                open={openBasket === b.basket}
                onToggle={() => setOpenBasket(openBasket === b.basket ? null : b.basket)}
                onMerchant={(m, category) => setSheet({ merchant: m, category, basket: b.basket })}
              />
            ))}
          </ul>
        )}
      </div>

      <Link
        href={`/activity?month=${data.month}`}
        className="flex items-center justify-center gap-1 border-t border-line py-2.5 text-xs font-medium text-accent"
      >
        Every transaction in {month} <Icon name="chevron" size={13} />
      </Link>

      {sheet && (
        <PurchasesSheet
          merchant={sheet.merchant}
          category={sheet.category}
          basket={sheet.basket}
          onClose={() => setSheet(null)}
        />
      )}
    </section>
  );
}
