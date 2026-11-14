"use client";
/**
 * "Safe to spend" on Home — one of the main features. Owner: UI person.
 * Numbers: SafeToSpendSummary from GET /api/home, made by safeToSpend() — the same function
 * as the coach's safe_to_spend tool. NOTHING is calculated here: every amount on the card,
 * in the breakdown and in the two sheets comes from that object, and the lines add up to the
 * cent (lib/types.ts explains how). Only bar widths are worked out, for drawing.
 *
 * Layout (compact):
 *   big number   = what's safe for the next 7 days (the days before payday only)
 *   one row      = what's available until payday — kept apart so the two are never mixed up
 *   bar          = the last 7 days' spending against that safe amount ("am I on pace?")
 *   "How is this worked out?" = the full calculation, folded away
 *   two buttons  = the fixed costs it counted, and the day-by-day plan
 * WHY say "no payday found" / "short by …": missing data is named, never papered over.
 */
import Link from "next/link";
import { useState } from "react";
import type { SafeToSpendSummary } from "@/lib/types";
import { fiDate, formatValue, weekdayDate } from "@/components/charts/format";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Icon } from "@/components/ui/Icon";
import { UpcomingPayments } from "./UpcomingPayments";

const eur = (n: number) => formatValue(n, "€");

/** The pill: "Payday Wed 2.12." (the date), or that none was found. */
function paydayText(s: SafeToSpendSummary): string {
  return s.nextPayday ? `Payday ${weekdayDate(s.nextPayday)}` : "No payday found";
}

/** "in 19 days" / "tomorrow" / "today". */
function inDays(n: number): string {
  return n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
}

/** "Today", "Tomorrow", "Thu 1.10." for the plan. */
function dayName(date: string, today: string, i: number): string {
  if (date === today) return "Today";
  if (i === 1) return "Tomorrow";
  return weekdayDate(date);
}

/** One line of the calculation: sign, label, amount. */
function Line({
  sign,
  label,
  note,
  value,
  strong,
  valueClass = "",
}: {
  sign: string;
  label: string;
  note?: string;
  value: string;
  strong?: boolean;
  valueClass?: string;
}) {
  return (
    <div className={`flex items-baseline gap-2 py-1.5 ${strong ? "border-t border-line font-semibold" : ""}`}>
      <span className="w-3 shrink-0 text-center text-muted">{sign}</span>
      <span className="min-w-0 flex-1">
        <span className="text-sm">{label}</span>
        {note && <span className="block text-[11px] text-muted">{note}</span>}
      </span>
      <span className={`shrink-0 text-sm tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

function Breakdown({ s }: { s: SafeToSpendSummary }) {
  const days = s.daysToPayday;
  const until = s.nextPayday ? "payday" : `the next ${days} days`;
  return (
    <div className="mt-2 rounded-xl bg-surface-2 px-3 py-1">
      <Line sign="" label={`Balance today (${fiDate(s.today)})`} value={eur(s.balanceEur)} />
      <Line
        sign="−"
        label={`Fixed costs before ${until}`}
        note={s.fixedCosts.length ? `${s.fixedCosts.length} payment${s.fixedCosts.length === 1 ? "" : "s"}` : "No regular bills found"}
        value={eur(-s.fixedCostsBeforePaydayEur)}
      />
      <Line
        sign="−"
        label={`Surprise reserve for ${days} days`}
        note={
          s.surpriseAvgPerMonthEur > 0
            ? `Your surprise costs average ${eur(s.surpriseAvgPerMonthEur)} a month`
            : "No surprise costs in your history"
        }
        value={eur(-s.surpriseBufferEur)}
      />
      <Line
        sign="="
        strong
        label={`Left until ${until}`}
        value={eur(s.leftAfterCostsEur)}
        valueClass={s.leftAfterCostsEur < 0 ? "text-money-out" : ""}
      />
      {s.shortfallEur > 0 ? (
        <p className="pb-2 pt-1 text-xs text-money-out">
          Fixed costs and the reserve are {eur(s.shortfallEur)} more than your balance, so nothing is safe to
          spend {s.nextPayday ? "before payday" : "for now"}.
        </p>
      ) : (
        <>
          <Line sign="÷" label={`${days} days until ${s.nextPayday ? "payday" : "then"}`} value={`${eur(s.safePerDayEur)} a day`} />
          <Line
            sign="×"
            strong
            label={`${s.coveredDays} days${s.coveredDays < s.requestedDays ? " (payday comes first)" : ""}`}
            value={eur(s.safeForRequestedDaysEur)}
            valueClass="text-accent"
          />
        </>
      )}
      {!s.nextPayday && (
        <p className="pb-2 text-[11px] text-muted">No regular salary found, so a 30-day month is assumed.</p>
      )}
    </div>
  );
}

function WeekPlan({ s, onClose }: { s: SafeToSpendSummary; onClose: () => void }) {
  return (
    <BottomSheet label="Safe to spend" title={`Your next ${s.requestedDays} days`} onClose={onClose}>
      <p className="mt-1 text-sm text-muted">
        {s.shortfallEur > 0
          ? "Bills and the reserve before payday take all of your balance, so there's no daily amount this week."
          : `${eur(s.safePerDayEur)} a day keeps you on track until ${s.nextPayday ? "payday" : "the end of the month"}.`}
      </p>
      <ul className="mt-3 overflow-hidden rounded-xl bg-surface shadow-sm">
        {s.plan.map((d, i) => (
          <li key={d.date} className="border-b border-line px-4 py-2.5 last:border-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className={`text-sm ${i === 0 ? "font-semibold" : ""}`}>{dayName(d.date, s.today, i)}</span>
              {d.isPayday ? (
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">Payday</span>
              ) : d.allowanceEur === null ? (
                <span className="text-xs text-muted">New budget after payday</span>
              ) : (
                <span className="text-sm font-semibold tabular-nums">{eur(d.allowanceEur)}</span>
              )}
            </div>
            {d.payments.map((p) => (
              <div key={p.name} className="mt-0.5 flex justify-between gap-3 text-xs text-muted">
                <span className="flex items-center gap-1">
                  <Icon name="calendar" size={12} /> {p.name} due
                </span>
                <span className="tabular-nums">{eur(-p.amountEur)}</span>
              </div>
            ))}
          </li>
        ))}
        <li className="flex justify-between gap-3 bg-surface-2 px-4 py-2.5 text-sm font-semibold">
          <span>Safe for {s.coveredDays} days</span>
          <span className="tabular-nums text-accent">{eur(s.safeForRequestedDaysEur)}</span>
        </li>
      </ul>
      <Link
        href={`/chat?ask=${encodeURIComponent("Help me plan my spending for the next 7 days")}`}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3 text-sm font-semibold text-accent-foreground"
      >
        <Icon name="chat" size={18} /> Plan it with the coach
      </Link>
    </BottomSheet>
  );
}

export function SafeToSpendCard({ s, weekSpentEur }: { s: SafeToSpendSummary; weekSpentEur: number | null }) {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<"costs" | "plan" | null>(null);
  const short = s.shortfallEur > 0;
  // WHY only when the whole week is before payday: otherwise 7 days of spending would be
  // compared with fewer days of money.
  const showPace = weekSpentEur !== null && s.coveredDays === s.requestedDays;
  const over = showPace && weekSpentEur > s.safeForRequestedDaysEur;
  const fill = !showPace
    ? 0
    : s.safeForRequestedDaysEur > 0
      ? Math.min(1, weekSpentEur / s.safeForRequestedDaysEur)
      : weekSpentEur > 0
        ? 1
        : 0;

  return (
    <section aria-label="Safe to spend" className="rounded-2xl bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted">
          Safe to spend · next {s.coveredDays} day{s.coveredDays === 1 ? "" : "s"}
        </p>
        <span className="shrink-0 rounded-full bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium text-accent">
          {paydayText(s)}
        </span>
      </div>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${short ? "" : "text-accent"}`}>
        {eur(s.safeForRequestedDaysEur)}
      </p>
      <p className="mt-0.5 text-xs text-muted">
        {short
          ? `Bills and the reserve ${s.nextPayday ? "before payday" : `in the next ${s.daysToPayday} days`} are ${eur(s.shortfallEur)} more than your balance.`
          : `About ${eur(s.safePerDayEur)} a day`}
      </p>

      {/* Until payday — a different amount from the 7 days above, so it gets its own row. */}
      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2">
        <span className="text-xs text-muted">
          {s.nextPayday
            ? `Available until payday, ${inDays(s.daysToPayday)}`
            : `Available for the next ${s.daysToPayday} days`}
        </span>
        <span className="text-sm font-semibold tabular-nums">{eur(s.safeUntilPaydayEur)}</span>
      </div>

      {/* Weekly pace: the last 7 days' spending against the safe amount for 7 days. */}
      {showPace && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-muted">
              Last 7 days: <span className="font-semibold text-foreground tabular-nums">{eur(weekSpentEur)}</span> spent
            </span>
            <span className={over ? "font-medium text-money-out" : "text-muted"}>
              {over ? "Faster than safe" : "Within safe pace"}
            </span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${fill * 100}%`, background: over ? "var(--money-out)" : "var(--accent)" }}
            />
          </div>
        </div>
      )}

      {/* The full calculation, folded away */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-3 flex w-full items-center gap-1 text-xs font-medium text-muted"
      >
        <Icon name="chevron" size={14} className={`transition-transform ${open ? "rotate-90" : ""}`} />
        How is this worked out?
      </button>
      {open && <Breakdown s={s} />}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setSheet("costs")}
          className="flex items-center justify-center gap-1.5 rounded-full border border-line py-2 text-xs font-semibold"
        >
          <Icon name="calendar" size={15} /> Fixed costs ({s.fixedCosts.length})
        </button>
        <button
          type="button"
          onClick={() => setSheet("plan")}
          className="flex items-center justify-center gap-1.5 rounded-full border border-line py-2 text-xs font-semibold"
        >
          <Icon name="sliders" size={15} /> Weekly plan
        </button>
      </div>

      {sheet === "costs" && (
        <BottomSheet label="Safe to spend" title="Fixed costs before payday" onClose={() => setSheet(null)}>
          <p className="mb-3 mt-1 text-sm text-muted">
            Bills and savings expected on their usual day of the month, up to{" "}
            {s.nextPayday ? `payday (${fiDate(s.nextPayday)})` : `the next ${s.daysToPayday} days`}.
          </p>
          <UpcomingPayments
            items={s.fixedCosts}
            max={s.fixedCosts.length}
            empty="No regular bills or savings found before payday."
            nested
          />
          {s.fixedCosts.length > 0 && (
            <div className="mt-2 flex justify-between px-4 text-sm font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{eur(-s.fixedCostsBeforePaydayEur)}</span>
            </div>
          )}
        </BottomSheet>
      )}
      {sheet === "plan" && <WeekPlan s={s} onClose={() => setSheet(null)} />}
    </section>
  );
}
