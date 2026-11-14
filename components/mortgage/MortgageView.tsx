"use client";
/**
 * "Home loan" tab — the customer's mortgage application, no AI. Owner: UI person.
 * Data comes from GET /api/mortgage (lib/data/mortgage.ts → getMortgageSummary).
 *
 * WHY no verdicts of our own (e.g. "your income is enough ✓"): the bank's
 * decision can't be reproduced from the data, so we only show what the
 * bank recorded plus plain facts. See lib/data/mortgage.ts.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import type { MortgageSummary } from "@/lib/types";
import {
  COLLATERAL_TYPE,
  EVENT_TYPE,
  EXPENSE_TYPE,
  PROPERTY_TYPE,
  REJECTION,
  eur0,
  eventDetail,
  fiDate,
  label,
  pct,
} from "./labels";

/** Opens the chat and asks this question straight away (see ChatView). */
const askUrl = (q: string) => `/chat?ask=${encodeURIComponent(q)}`;

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-surface p-4 shadow-sm">
      {title && <h2 className="mb-3 text-sm font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

function Row({ name, value, strong }: { name: React.ReactNode; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 text-sm ${strong ? "font-semibold" : ""}`}>
      <span className={strong ? "" : "text-muted"}>{name}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function StatusCard({ m }: { m: MortgageSummary }) {
  const approved = m.decision === "approved";
  const reason = m.rejectionReason ? REJECTION[m.rejectionReason] : undefined;
  return (
    <Card>
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
          approved ? "bg-accent/10 text-accent" : "bg-danger-soft text-danger"
        }`}
      >
        {approved ? "✓ Approved" : "✕ Not approved"}
      </span>
      <p className="mt-3 text-sm text-muted">{label(PROPERTY_TYPE, m.property.type)}</p>
      <p className="text-3xl font-bold tabular-nums">{eur0(m.property.priceEur)}</p>
      <p className="mt-1 text-xs text-muted">
        Applied {fiDate(m.appliedOn)} · decided {fiDate(m.decidedOn)} ({m.daysToDecision} days)
      </p>

      {!approved && (
        <div className="mt-3 rounded-lg bg-danger-soft p-3 text-sm">
          <p className="font-semibold text-danger">
            {reason?.title ?? label({}, m.rejectionReason ?? "Reason not recorded")}
          </p>
          {reason && <p className="mt-0.5 text-foreground/80">{reason.text}</p>}
        </div>
      )}

      <Link
        href={askUrl(
          approved
            ? "What does my new home loan mean for my monthly budget?"
            : "Why was my home loan rejected, and what could I do about it?",
        )}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground"
      >
        💬 Ask the coach about this
      </Link>
    </Card>
  );
}

function FinancingCard({ m }: { m: MortgageSummary }) {
  const total = m.loanEur + m.equityEur || 1;
  const loanShare = m.loanEur / total;
  return (
    <Card title="How the home is paid for">
      <div className="flex h-3 overflow-hidden rounded-full" aria-hidden>
        <div className="bg-accent" style={{ width: `${loanShare * 100}%` }} />
        <div className="flex-1 bg-accent/25" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <span className="h-2 w-2 rounded-full bg-accent" /> Loan
          </p>
          <p className="font-semibold tabular-nums">{eur0(m.loanEur)}</p>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <span className="h-2 w-2 rounded-full bg-accent/25" /> Your own money
          </p>
          <p className="font-semibold tabular-nums">{eur0(m.equityEur)}</p>
        </div>
      </div>
      <div className="mt-3 space-y-1.5 border-t border-line pt-3">
        <Row name="Loan-to-value" value={pct(m.loanToValue)} />
        <Row name="Collateral used in the decision" value={eur0(m.collateralValueEur)} />
      </div>
    </Card>
  );
}

function CostsCard({ m }: { m: MortgageSummary }) {
  if (m.recordedCosts.length === 0) return null;
  // WHY no total: some items are one-off, some look monthly (see recordedCosts in lib/types.ts).
  return (
    <Card title="Costs the bank recorded">
      <div className="space-y-1.5">
        {m.recordedCosts.map((c, i) => (
          <Row key={`${c.label}-${i}`} name={label(EXPENSE_TYPE, c.label)} value={eur0(c.value)} />
        ))}
      </div>
    </Card>
  );
}

function MonthlyCard({ m }: { m: MortgageSummary }) {
  const left = m.monthly.incomeEur - m.monthly.spendingEur;
  return (
    <Card title="Your money each month">
      <p className="-mt-2 mb-3 text-xs text-muted">
        Average of {fiDate(m.monthly.range.from)} – {fiDate(m.monthly.range.to)}, from your account
      </p>
      <div className="space-y-1.5">
        <Row name="Income" value={eur0(m.monthly.incomeEur)} />
        <Row name="Spending" value={eur0(m.monthly.spendingEur)} />
        <div className="border-t border-line pt-1.5">
          <Row name="Left over" value={eur0(left)} strong />
        </div>
      </div>
      <div className="mt-3 rounded-lg bg-background p-3">
        <Row name="Required monthly income" value={eur0(m.requiredMonthlyIncomeEur)} />
        <p className="mt-1 text-[11px] text-muted">The bank&apos;s figure for this loan.</p>
      </div>
    </Card>
  );
}

function CollateralCard({ m }: { m: MortgageSummary }) {
  if (m.collateral.length === 0) return null;
  return (
    <Card title="Collateral">
      <ul className="space-y-2">
        {m.collateral.map((c, i) => (
          <li key={i} className="flex items-center justify-between gap-3 text-sm">
            <span>
              {label(COLLATERAL_TYPE, c.type)}
              <span className="ml-2 rounded-full bg-background px-2 py-0.5 text-[11px] text-muted">
                {c.status}
              </span>
            </span>
            <span className="tabular-nums">{eur0(c.valueEur)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function HomesCard({ m }: { m: MortgageSummary }) {
  if (m.propertiesConsidered.length === 0) return null;
  return (
    <Card title={`Homes you looked at (${m.propertiesConsidered.length})`}>
      <ul className="space-y-2.5">
        {m.propertiesConsidered.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <span className="text-lg leading-none">{p.type === "apartment" ? "🏢" : "🏡"}</span>
              <span>
                {label(PROPERTY_TYPE, p.type)}
                {p.chosen && (
                  <span className="ml-2 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
                    applied for
                  </span>
                )}
              </span>
            </span>
            <span className="text-right tabular-nums">
              {p.firstPriceEur !== p.lastPriceEur && (
                <span className="block text-[11px] text-muted line-through">{eur0(p.firstPriceEur)}</span>
              )}
              {eur0(p.lastPriceEur)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TimelineCard({ m }: { m: MortgageSummary }) {
  return (
    <Card title="Timeline">
      <ol className="relative ml-1 border-l border-line">
        {m.timeline.map((e, i) => {
          const detail = eventDetail(e);
          const isDecision = e.type === "loan_decision";
          return (
            <li key={i} className="relative pb-3 pl-4 last:pb-0">
              <span
                className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface ${
                  isDecision ? (m.decision === "approved" ? "bg-accent" : "bg-danger") : "bg-line"
                }`}
              />
              <p className="text-[11px] text-muted">{fiDate(e.date)}</p>
              <p className={`text-sm ${isDecision ? "font-semibold" : ""}`}>{label(EVENT_TYPE, e.type)}</p>
              {detail && <p className="text-xs text-muted">{detail}</p>}
            </li>
          );
        })}
      </ol>
      {m.contactsWithBank > 0 && (
        <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
          💬 You talked with the bank {m.contactsWithBank} times along the way.
        </p>
      )}
    </Card>
  );
}

function NoMortgage() {
  return (
    <Card>
      <p className="text-3xl">🏠</p>
      <p className="mt-2 font-semibold">No home loan application</p>
      <p className="mt-1 text-sm text-muted">
        Thinking about buying a home? The coach can help you see how much you could put aside each
        month.
      </p>
      <Link
        href={askUrl("How could I save more each month?")}
        className="mt-4 flex w-full items-center justify-center rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground"
      >
        💬 Ask the coach
      </Link>
    </Card>
  );
}

export function MortgageView() {
  // undefined = loading, null = this customer has no mortgage
  const [data, setData] = useState<MortgageSummary | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/mortgage")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.detail || json.error);
        setData(json.mortgage);
      })
      .catch((err) => setError(String(err.message ?? err)));
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <header className="border-b border-line bg-surface px-4 py-3">
        <h1 className="font-semibold">Home loan</h1>
        {data && <p className="text-xs text-muted">Application {data.mortgageId}</p>}
      </header>

      <div className="space-y-4 p-4">
        {error && <p className="text-sm text-danger">⚠️ {error}</p>}
        {data === undefined && !error && <p className="text-sm text-muted">Loading…</p>}
        {data === null && <NoMortgage />}
        {data && (
          <>
            <StatusCard m={data} />
            <FinancingCard m={data} />
            <MonthlyCard m={data} />
            <CostsCard m={data} />
            <CollateralCard m={data} />
            <HomesCard m={data} />
            <TimelineCard m={data} />
          </>
        )}
      </div>
    </div>
  );
}
