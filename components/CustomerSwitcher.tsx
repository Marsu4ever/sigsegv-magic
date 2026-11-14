"use client";
/**
 * Demo-only strip at the top of the app: shows whose data you're looking at,
 * and opens a list to switch to another customer. Owner: UI person.
 *
 * WHY dark and separate from the app's own headers: it's a demo control, not part
 * of the bank app — the audience should see it isn't a real feature.
 * Hide it for a "clean" demo: SHOW_CUSTOMER_SWITCHER = false (pick on /customer_profiles instead).
 * The bar also holds the light/dark toggle; without the bar the app follows the phone's setting.
 */
import { useEffect, useState } from "react";
import type { DemoCustomerOption, DemoCustomersResponse } from "@/lib/types";
import { switchDemoCustomer } from "@/lib/demoCustomer";
import { ThemeToggle } from "@/components/ThemeToggle";

const SHOW_CUSTOMER_SWITCHER = true;

const eur = (n: number) => `€${n.toLocaleString("fi-FI")}`;
const reason = (r: string | null) => (r ?? "").replace(/_/g, " ");

function LoanBadge({ m }: { m: NonNullable<DemoCustomerOption["mortgage"]> }) {
  return m.decision === "approved" ? (
    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
      Approved
    </span>
  ) : (
    <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger">
      Rejected
    </span>
  );
}

function Row({ c, current }: { c: DemoCustomerOption; current: boolean }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => switchDemoCustomer(c.id)}
        className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left ${
          current ? "border-accent bg-accent/5" : "border-line bg-surface"
        }`}
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium">
            {c.id} <span className="font-normal text-muted">· {c.age} y</span>
          </span>
          <span className="block truncate text-xs text-muted">
            {c.mortgage?.rejectionReason
              ? reason(c.mortgage.rejectionReason)
              : `${eur(c.incomePerMonth)} in · ${eur(c.spendingPerMonth)} out / month`}
            {c.mortgage?.salarySweep && " · salary sweep"}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {c.mortgage && <LoanBadge m={c.mortgage} />}
          {current && <span className="text-accent">✓</span>}
        </span>
      </button>
    </li>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <ul className="space-y-1.5">{children}</ul>
    </section>
  );
}

function Sheet({ data, onClose }: { data: DemoCustomersResponse; onClose: () => void }) {
  // Close with Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const withLoan = data.customers
    .filter((c) => c.mortgage)
    // Approved first, then by rejection reason — one of each is easy to find.
    .sort((a, b) => (a.mortgage!.rejectionReason ?? "").localeCompare(b.mortgage!.rejectionReason ?? ""));
  const types = [...new Set(data.customers.map((c) => c.typeLabel))];

  return (
    <div className="fixed inset-0 z-40 mx-auto flex max-w-md flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose a demo customer"
        className="max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-background px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 -mx-4 flex items-start justify-between bg-background px-4 pb-2 pt-1">
          <div>
            <h2 className="font-semibold">Choose a demo customer</h2>
            <p className="text-xs text-muted">The whole app switches to this person&apos;s data.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="px-2 text-xl text-muted">
            ×
          </button>
        </div>

        <Group title={`🏠 With a home loan (${withLoan.length})`}>
          {withLoan.map((c) => (
            <Row key={c.id} c={c} current={c.id === data.current} />
          ))}
        </Group>

        {types.map((t) => (
          <Group key={t} title={t}>
            {data.customers
              .filter((c) => c.typeLabel === t && !c.mortgage)
              .sort((a, b) => a.age - b.age)
              .map((c) => (
                <Row key={c.id} c={c} current={c.id === data.current} />
              ))}
          </Group>
        ))}

        <Group title="Fake data">
          <li>
            <button
              type="button"
              onClick={() => switchDemoCustomer("MOCK")}
              className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm ${
                data.current === "MOCK" ? "border-accent bg-accent/5" : "border-line bg-surface"
              }`}
            >
              MOCK <span className="text-xs text-muted">· generated, for testing</span>
            </button>
          </li>
        </Group>

        {data.picked && (
          <button
            type="button"
            onClick={() => switchDemoCustomer(null)}
            className="mt-4 w-full rounded-full border border-line py-2 text-sm text-muted"
          >
            Back to the default ({data.defaultId})
          </button>
        )}
      </div>
    </div>
  );
}

export function CustomerSwitcher() {
  const [data, setData] = useState<DemoCustomersResponse | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/customers")
      .then((res) => (res.ok ? res.json() : null))
      .then(setData)
      .catch((err) => console.error("[customers]", err));
  }, []);

  if (!SHOW_CUSTOMER_SWITCHER) return null;
  const current = data?.customers.find((c) => c.id === data.current);

  return (
    <>
      <div className="flex items-center bg-foreground pr-3 text-xs text-background">
        <button
          type="button"
          onClick={() => data && setOpen(true)}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 py-1.5 pl-4 pr-2"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="rounded bg-background/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide">
              DEMO
            </span>
            <span className="truncate">
              {!data
                ? "Loading customer…"
                : current
                  ? `${current.id} · ${current.age} y${current.mortgage ? " · 🏠 home loan" : ""}`
                  : data.current === "MOCK"
                    ? "MOCK · fake data"
                    : data.current}
            </span>
          </span>
          <span className="shrink-0 font-semibold">Switch ›</span>
        </button>
        <ThemeToggle className="shrink-0 hover:bg-background/15" />
      </div>
      {open && data && <Sheet data={data} onClose={() => setOpen(false)} />}
    </>
  );
}
