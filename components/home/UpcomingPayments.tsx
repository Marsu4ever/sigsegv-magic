"use client";
/**
 * "Upcoming payments" on Home (and the fixed-costs sheet in Safe to spend). Owner: UI person.
 * Data: UpcomingPayment[] from GET /api/home (lib/insights/recurring.ts → upcomingPayments,
 * the same list safe_to_spend counts).
 *
 * WHY so careful with wording: these are PREDICTIONS from the customer's past payments, not
 * payments scheduled with the bank. So: dates say "around", amounts that vary get "≈", a line
 * says it's predicted, and opening a payment shows its real past payments and why it's counted.
 * Before payday the list is grouped and subtotalled — that's the money that must be there first.
 */
import Link from "next/link";
import { useState } from "react";
import type { UpcomingPayment } from "@/lib/types";
import { CategoryTile } from "@/components/charts/categoryIcons";
import { fiDate, formatValue, weekdayDate } from "@/components/charts/format";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Icon } from "@/components/ui/Icon";

const KIND_LABEL: Record<UpcomingPayment["kind"], string> = {
  bill: "Bill",
  subscription: "Subscription",
  automatic_saving: "To savings",
};

const eur = (n: number) => formatValue(n, "€");
/** "≈ −628,12 €" when the amount varies, "−890,00 €" when it's always the same. */
const amount = (p: UpcomingPayment) => `${p.amountIsEstimate ? "≈ " : ""}${eur(-p.amountEur)}`;

function whenText(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

const ordinal = (n: number) =>
  `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/** "on the 5th" / "between the 1st and 7th" / "on varying days (4th–30th)". */
function usualDays([from, to]: [number, number]): string {
  if (from === to) return `on the ${ordinal(from)}`;
  if (to - from <= 10) return `between the ${ordinal(from)} and ${ordinal(to)}`;
  return `on varying days (${ordinal(from)}–${ordinal(to)})`;
}

/** WHY 5: enough to plan the coming weeks without turning Home into a long list. */
const SHOWN = 5;

function Tile({ p }: { p: UpcomingPayment }) {
  return p.kind === "automatic_saving" ? (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
      <Icon name="piggy" size={18} />
    </span>
  ) : (
    <CategoryTile category={p.category} size={36} />
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-2.5 last:border-0">
      <dt className="shrink-0 text-sm text-muted">{label}</dt>
      <dd className="text-right text-sm">{children}</dd>
    </div>
  );
}

/** One payment opened: the prediction, why it's counted, and its real past payments. */
function PaymentSheet({ p, onClose }: { p: UpcomingPayment; onClose: () => void }) {
  const predicted = p.status === "predicted";
  return (
    <BottomSheet label={`${predicted ? "Predicted" : "Scheduled"} · ${KIND_LABEL[p.kind]}`} title={p.name} onClose={onClose}>
      <dl className="mt-3 rounded-xl bg-surface px-4 shadow-sm">
        <Fact label="Expected">
          {predicted ? "around " : ""}
          {weekdayDate(p.date)} ({whenText(p.inDays)})
        </Fact>
        <Fact label="Amount">
          <span className="font-semibold tabular-nums">{amount(p)}</span>
          <span className="block text-xs text-muted">
            {p.amountIsEstimate
              ? `average; it was ${eur(p.minAmountEur)}–${eur(p.maxAmountEur)}`
              : "the same as last time"}
          </span>
        </Fact>
        <Fact label="Category">{p.category}</Fact>
        <Fact label="Usually paid">{usualDays(p.dayRange)}</Fact>
      </dl>

      <div className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">
        <p className="text-xs font-semibold text-muted">Why it&apos;s on this list</p>
        <p className="mt-0.5">{p.reason}</p>
        {predicted && (
          <p className="mt-2 text-xs text-muted">
            This is a prediction from your past payments, not a payment scheduled with the bank. The real
            date and amount can differ.
          </p>
        )}
      </div>

      <h3 className="mb-1.5 mt-4 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
        Past payments ({p.history.length})
      </h3>
      <ul className="max-h-60 overflow-y-auto rounded-xl bg-surface shadow-sm">
        {p.history.map((h, i) => (
          <li key={`${h.date}-${i}`} className="flex justify-between gap-3 border-b border-line px-4 py-2 text-sm last:border-0">
            <span>{fiDate(h.date)}</span>
            <span className="tabular-nums">{eur(-h.amountEur)}</span>
          </li>
        ))}
      </ul>
      {p.history[0] && (
        <Link
          href={`/activity?month=${p.history[0].date.slice(0, 7)}`}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-line py-3 text-sm font-semibold"
        >
          <Icon name="activity" size={18} /> See the latest one in Activity
        </Link>
      )}
    </BottomSheet>
  );
}

function Row({ p, onOpen }: { p: UpcomingPayment; onOpen?: () => void }) {
  const sub = [KIND_LABEL[p.kind], p.category !== p.name ? p.category : null, whenText(p.inDays)]
    .filter(Boolean)
    .join(" · ");
  const body = (
    <>
      <Tile p={p} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{p.name}</p>
        <p className="truncate text-xs text-muted">{sub}</p>
      </div>
      <div className="shrink-0 text-right">
        {/* Same colours as the transaction list: payments plain, moves to savings grey. */}
        <p className={`text-sm tabular-nums ${p.kind === "automatic_saving" ? "text-muted" : ""}`}>{amount(p)}</p>
        <p className="text-[11px] text-muted">
          {p.status === "predicted" ? "around " : ""}
          {weekdayDate(p.date)}
        </p>
      </div>
    </>
  );
  return (
    <li className="border-b border-line last:border-0">
      {onOpen ? (
        <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-2.5 text-left">
          {body}
        </button>
      ) : (
        <div className="flex items-center gap-3 px-4 py-2.5">{body}</div>
      )}
    </li>
  );
}

/**
 * A small heading inside the list: "Before payday · Fri 16.10." with its subtotal.
 * WHY highlighted: these payments must be covered from today's balance.
 */
function GroupHeader({ title, total, highlight }: { title: string; total?: number; highlight?: boolean }) {
  return (
    <li
      className={`flex justify-between gap-3 px-4 py-1.5 text-xs ${
        highlight ? "bg-accent/10 font-semibold text-accent" : "bg-background font-medium text-muted"
      }`}
    >
      <span>{title}</span>
      {total !== undefined && <span className="tabular-nums">{eur(-total)}</span>}
    </li>
  );
}

export function UpcomingPayments({
  items,
  nextPayday = null,
  beforePaydayEur,
  totalEur,
  max = SHOWN,
  empty = "No regular bills found in your past payments.",
  inspectable = true,
}: {
  items: UpcomingPayment[];
  /** Splits the list into before / after payday (Home). */
  nextPayday?: string | null;
  /** Subtotal before payday — from safe_to_spend (the same list), never added up here. */
  beforePaydayEur?: number;
  /** Sum of all `items`, from the API. */
  totalEur?: number;
  /** How many rows at first (Home: 5; "Show all" for the rest). */
  max?: number;
  empty?: string;
  /** Tap a row → its history and why it's counted. */
  inspectable?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<UpcomingPayment | null>(null);

  if (items.length === 0) {
    return <p className="rounded-2xl bg-surface p-4 text-sm text-muted shadow-sm">{empty}</p>;
  }

  const shown = showAll ? items : items.slice(0, max);
  const before = nextPayday ? shown.filter((p) => p.date <= nextPayday) : [];
  const after = nextPayday ? shown.filter((p) => p.date > nextPayday) : shown;
  const allPredicted = items.every((p) => p.status === "predicted");
  const rowFor = (p: UpcomingPayment) => (
    <Row key={`${p.name}-${p.date}`} p={p} onOpen={inspectable ? () => setOpen(p) : undefined} />
  );

  return (
    <div className="overflow-hidden rounded-2xl bg-surface shadow-sm">
      <ul>
        {nextPayday && before.length > 0 && (
          <GroupHeader title={`Before payday · ${weekdayDate(nextPayday)}`} total={beforePaydayEur} highlight />
        )}
        {before.map(rowFor)}
        {nextPayday && before.length > 0 && after.length > 0 && <GroupHeader title="After payday" />}
        {after.map(rowFor)}
      </ul>

      {items.length > max && (
        <button
          type="button"
          onClick={() => setShowAll((s) => !s)}
          className="w-full border-t border-line py-2 text-xs font-medium text-accent"
        >
          {showAll ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}

      {totalEur !== undefined && (
        <div className="flex items-baseline justify-between gap-3 border-t border-line px-4 py-2.5">
          <span className="text-sm font-semibold">Expected in the next month</span>
          <span className="text-sm font-semibold tabular-nums">{eur(-totalEur)}</span>
        </div>
      )}
      {allPredicted && (
        <p className="flex items-start gap-1.5 border-t border-line px-4 py-2 text-[11px] text-muted">
          <Icon name="alert" size={12} className="mt-px shrink-0" />
          Predicted from your past payments, not scheduled with the bank. ≈ = the amount varies.
        </p>
      )}

      {open && <PaymentSheet p={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
