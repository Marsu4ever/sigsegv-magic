"use client";
/**
 * Account overview — the first section of Home. Owner: UI person.
 * Data: AccountSummary from GET /api/account (lib/data/home.ts), i.e. the selected customer's
 * own transactions: balance after the latest one, this month's income / expenses / net, and
 * the balance at the end of last month. Switching customer reloads the app, so it all updates.
 *
 * Layout (compact, balance is the focus):
 *   green card  — balance, a small ↗ / ↘ pill (change since the end of last month), "Details"
 *   two tiles   — income (green) and expenses (red), this month so far
 *   one row     — net cash flow (green if positive, red if negative)
 * Details (account number, last month's closing balance, savings moves, lowest balance, the
 * 90-day chart) open in a bottom sheet, so the section stays short on a phone.
 * WHY no numbers when there are no transactions: an empty state instead of a made-up 0 €.
 */
import Link from "next/link";
import { useState } from "react";
import type { AccountSummary } from "@/lib/types";
import { BalanceChart } from "@/components/account/BalanceChart";
import { fiDate, formatValue, monthName } from "@/components/charts/format";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Icon } from "@/components/ui/Icon";

const eur = (n: number) => formatValue(n, "€");
/** +12,30 € / −12,30 € (formatValue already puts the minus on negatives). */
// WHY `n === 0 ? 0 : n`: turns −0 into 0, so an empty month shows 0,00 €, not −0,00 €.
const signed = (n: number) => (n > 0 ? `+${eur(n)}` : eur(n === 0 ? 0 : n));
/** Green for money gained, red for money lost, plain for exactly zero. */
const tone = (n: number) => (n > 0 ? "text-money-in" : n < 0 ? "text-money-out" : "");

/** ↗ +312,40 € / ↘ −312,40 € since the end of last month, as a small pill on the green card. */
function ChangePill({ change, since }: { change: number; since: string }) {
  const up = change > 0;
  return (
    // WHY a light pill on the green card: green / red text straight on green would be unreadable.
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs font-semibold tabular-nums ${tone(change)}`}
      title={`Balance change since ${since}`}
    >
      {change !== 0 && <Icon name={up ? "arrow-up" : "arrow-down"} size={13} strokeWidth={2.5} />}
      {change !== 0 && <span className="sr-only">{up ? "Up" : "Down"}</span>}
      {change === 0 ? "No change" : signed(change)}
    </span>
  );
}

function DetailRow({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-2.5 last:border-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`text-sm font-medium tabular-nums ${valueClass}`}>{value}</dd>
    </div>
  );
}

function AccountDetails({ data, onClose }: { data: AccountSummary; onClose: () => void }) {
  const m = data.month;
  const prev = data.previousMonth;
  return (
    <BottomSheet label="Current account" title="Account details" onClose={onClose}>
      <dl className="mt-3 rounded-xl bg-surface px-4 shadow-sm">
        <DetailRow label="Account" value={data.accountId ?? "–"} />
        <DetailRow label={`Balance on ${fiDate(data.asOf)}`} value={data.balanceEur === null ? "–" : eur(data.balanceEur)} />
        {prev && <DetailRow label={`Balance on ${fiDate(prev.endDate)}`} value={eur(prev.balanceEur)} />}
        {prev && <DetailRow label="Change this month" value={signed(prev.changeEur)} valueClass={tone(prev.changeEur)} />}
        {/* WHY: tells the user how much history these numbers rest on (some customers have little). */}
        <DetailRow
          label="Transactions since"
          value={`${monthName(`${data.list.first}-01`)} ${data.list.first.slice(0, 4)}`}
        />
      </dl>

      <h3 className="mb-1.5 mt-4 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
        {fiDate(m.range.from)} – {fiDate(m.range.to)}
      </h3>
      <dl className="rounded-xl bg-surface px-4 shadow-sm">
        <DetailRow label="Income" value={signed(m.incomeEur)} valueClass={tone(m.incomeEur)} />
        <DetailRow label="Expenses" value={signed(-m.spendingEur)} valueClass={tone(-m.spendingEur)} />
        <DetailRow label="Net cash flow" value={signed(m.netEur)} valueClass={tone(m.netEur)} />
        {/* WHY apart: a move to your own savings is neither income nor an expense. */}
        {m.movedToSavingsEur > 0 && <DetailRow label="Moved to your savings" value={eur(m.movedToSavingsEur)} />}
      </dl>

      {data.balanceHistory.length > 1 && (
        <section className="mt-4 rounded-xl bg-surface p-4 shadow-sm">
          <h3 className="text-sm font-semibold">Balance, last 90 days</h3>
          {data.lowest && (
            <p className="text-xs text-muted">
              Lowest: {eur(data.lowest.balanceEur)} on {fiDate(data.lowest.date)}
            </p>
          )}
          <div className="mt-2">
            <BalanceChart rows={data.balanceHistory} />
          </div>
        </section>
      )}

      <Link
        href="/activity"
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3 text-sm font-semibold text-accent-foreground"
      >
        <Icon name="activity" size={18} /> See all transactions
      </Link>
    </BottomSheet>
  );
}

/** "1.–29. September" while the month is still going; "September" once it's complete. */
function monthSoFar(from: string, to: string): string {
  const name = monthName(from);
  const lastDay = new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)), 0)).getUTCDate();
  const toDay = Number(to.slice(8, 10));
  return toDay < lastDay ? `1.–${toDay}. ${name} (so far)` : name;
}

export function AccountOverview({ data }: { data: AccountSummary }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const m = data.month;
  const month = monthName(m.range.from);

  // No transactions at all: say so, never show a placeholder balance.
  if (data.balanceEur === null) {
    return (
      <section className="rounded-2xl bg-surface p-5 text-sm text-muted shadow-sm">
        <p className="font-semibold text-foreground">No account data yet</p>
        <p className="mt-1">This customer has no transactions, so there is no balance to show.</p>
      </section>
    );
  }

  return (
    <section aria-label="Account overview" className="space-y-3">
      {/* Balance — the one number everybody looks for first */}
      <div className="rounded-2xl bg-accent p-5 text-accent-foreground shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium opacity-90">Current account</p>
            {data.accountId && <p className="truncate text-xs opacity-75">{data.accountId}</p>}
          </div>
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            className="flex shrink-0 items-center gap-0.5 rounded-full bg-accent-foreground/15 py-1 pl-3 pr-2 text-xs font-medium"
          >
            Details <Icon name="chevron" size={14} />
          </button>
        </div>
        <p className="mt-3 text-4xl font-bold tracking-tight tabular-nums">{eur(data.balanceEur)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {data.previousMonth ? (
            <>
              <ChangePill change={data.previousMonth.changeEur} since={fiDate(data.previousMonth.endDate)} />
              <span className="opacity-80">since end of {monthName(data.previousMonth.endDate)}</span>
            </>
          ) : (
            // WHY say it: an empty spot would look broken; this explains there's nothing to compare yet.
            <span className="opacity-80">First month of history</span>
          )}
          <span className="opacity-50" aria-hidden>
            ·
          </span>
          <span className="opacity-80">on {fiDate(data.asOf)}</span>
        </div>
      </div>

      {/* Income and expenses, this month so far */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface px-4 py-3 shadow-sm">
          <p className="text-xs text-muted">Income · {month}</p>
          <p className={`mt-0.5 text-lg font-semibold tabular-nums ${tone(m.incomeEur)}`}>{signed(m.incomeEur)}</p>
          {m.incomeEur === 0 && <p className="text-[11px] text-muted">None yet this month</p>}
        </div>
        <div className="rounded-2xl bg-surface px-4 py-3 shadow-sm">
          <p className="text-xs text-muted">Expenses · {month}</p>
          <p className={`mt-0.5 text-lg font-semibold tabular-nums ${tone(-m.spendingEur)}`}>{signed(-m.spendingEur)}</p>
          {m.spendingEur === 0 && <p className="text-[11px] text-muted">None yet this month</p>}
        </div>
      </div>

      {/* Net cash flow = income − expenses (from lib/data, not worked out here) */}
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 shadow-sm">
        <div>
          <p className="text-sm font-medium">Net cash flow</p>
          <p className="text-xs text-muted">Income minus expenses, {monthSoFar(m.range.from, m.range.to)}</p>
        </div>
        <p className={`text-lg font-semibold tabular-nums ${tone(m.netEur)}`}>{signed(m.netEur)}</p>
      </div>

      {detailsOpen && <AccountDetails data={data} onClose={() => setDetailsOpen(false)} />}
    </section>
  );
}
