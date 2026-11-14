"use client";
/**
 * "Safe to spend this week" on Home. Owner: UI person.
 * Numbers: SafeToSpendSummary from GET /api/home, made by safeToSpend() — the same function
 * as the coach's safe_to_spend tool, so Home and the chat always agree.
 *
 * WHY one big number + one bar: the answer comes first ("how much can I spend?"); the bar
 * shows at a glance where the rest of the balance is already going before payday.
 * Colours: shades of the app green, like the Week tab ("50 shades of green", team call).
 */
import type { SafeToSpendSummary } from "@/lib/types";
import { formatValue } from "@/components/charts/format";

const eur = (n: number) => formatValue(n, "€");

const PARTS = [
  { key: "bills", label: "Bills", color: "color-mix(in srgb, var(--accent) 62%, black)" },
  { key: "buffer", label: "Buffer", color: "color-mix(in srgb, var(--accent) 62%, white)" },
  { key: "free", label: "Free till payday", color: "var(--accent)" },
] as const;

function paydayText(s: SafeToSpendSummary): string {
  if (!s.nextPayday) return "Next 30 days";
  if (s.daysToPayday <= 0) return "Payday today";
  if (s.daysToPayday === 1) return "Payday tomorrow";
  return `Payday in ${s.daysToPayday} days`;
}

export function SafeToSpendCard({ s }: { s: SafeToSpendSummary }) {
  const amounts = {
    bills: s.fixedCostsBeforePaydayEur,
    buffer: s.surpriseBufferEur,
    free: s.safeUntilPaydayEur,
  };
  const total = amounts.bills + amounts.buffer + amounts.free || 1;
  const nothingLeft = s.safeUntilPaydayEur <= 0;

  return (
    <section className="rounded-2xl bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted">Safe to spend this week</p>
          <p className={`mt-1 text-3xl font-bold tabular-nums ${nothingLeft ? "" : "text-accent"}`}>
            {eur(s.safeForRequestedDaysEur)}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {nothingLeft
              ? "Bills before payday take all of your balance."
              : `About ${eur(s.safePerDayEur)} a day`}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
          {paydayText(s)}
        </span>
      </div>

      {/* Where today's balance goes before payday. */}
      <div className="mt-4 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface-2">
        {PARTS.map((p) =>
          amounts[p.key] > 0 ? (
            <div key={p.key} className="h-full" style={{ width: `${(amounts[p.key] / total) * 100}%`, background: p.color }} />
          ) : null,
        )}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {PARTS.map((p) => (
          <div key={p.key}>
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
              <span className="truncate">{p.label}</span>
            </div>
            <div className="text-sm font-semibold tabular-nums">{eur(amounts[p.key])}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
