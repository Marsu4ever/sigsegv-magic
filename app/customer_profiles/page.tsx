/**
 * /customer_profiles — TEAM PAGE: all demo customers in data/demo/, grouped by
 * a rough spending type, so we can pick good ones for testing and the demo.
 * Logic lives in lib/data/profiles.ts.
 */
import { BASKETS, type Basket } from "@/lib/types";
import { getCustomerId } from "@/lib/data";
import { allProfiles, SPENDING_TYPES, type CustomerProfile } from "@/lib/data/profiles";
import { ageGroupFor } from "@/lib/insights/benchmarks";
import { ForPickedCustomer } from "@/components/dev/ForPickedCustomer";
import { UseCustomerButton } from "@/components/dev/UseCustomerButton";
import { Code, DevPage, Section } from "@/components/dev/DevPage";

const BASKET_COLOR: Record<Basket, string> = {
  mandatory_regular: "var(--basket-regular)",
  mandatory_irregular: "var(--basket-irregular)",
  everyday: "var(--basket-everyday)",
};

const BASKET_SHORT: Record<Basket, string> = {
  mandatory_regular: "Regular",
  mandatory_irregular: "Irregular",
  everyday: "Everyday",
};

const pct = (n: number) => `${Math.round(n * 100)}%`;
const eur = (n: number) => `€${n.toLocaleString("fi-FI")}`;

function ProfileCard({ p, current }: { p: CustomerProfile; current: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${current ? "border-accent" : "border-line"}`}>
      <div className="flex items-center justify-between">
        <span className="font-medium">
          {p.id}{" "}
          {current && (
            <span className="ml-1 rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-accent-foreground">
              in use
            </span>
          )}
        </span>
        <span className="text-xs text-muted">
          age {p.age} · {ageGroupFor(p.age)}
        </span>
      </div>

      <div className="mt-1 grid grid-cols-3 gap-1 text-xs">
        <div>
          <div className="text-muted">Income</div>
          {eur(p.incomePerMonth)}/mo
        </div>
        <div>
          <div className="text-muted">Spending</div>
          {eur(p.spendingPerMonth)}/mo
        </div>
        <div>
          <div className="text-muted">Keeps</div>
          <span className={p.savingsRate < 0 ? "text-red-600" : ""}>{pct(p.savingsRate)}</span>
        </div>
      </div>

      {/* Basket split as one bar */}
      <div className="mt-2 flex h-2 overflow-hidden rounded-full" title="Spending by basket">
        {BASKETS.map((b) => (
          <div key={b} style={{ width: pct(p.basketShare[b]), background: BASKET_COLOR[b] }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        {BASKETS.map((b) => (
          <span key={b}>
            {BASKET_SHORT[b]} {pct(p.basketShare[b])}
          </span>
        ))}
      </div>

      {p.mortgage && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span
            className={`rounded-full px-2 py-0.5 font-medium ${
              p.mortgage.decision === "approved" ? "bg-accent/10 text-accent" : "bg-red-50 text-red-700"
            }`}
          >
            🏠 Home loan {p.mortgage.decision}
          </span>
          {p.mortgage.rejectionReason && (
            <span className="text-muted">{p.mortgage.rejectionReason.replace(/_/g, " ")}</span>
          )}
          {p.mortgage.salarySweep && (
            <span className="text-muted" title="Salary moves out right away — little spending shows">
              · salary sweep
            </span>
          )}
        </p>
      )}

      <p className="mt-1 text-[11px] text-muted">
        Biggest everyday category: {p.topEveryday} · {p.transactions} transactions · {p.firstDate} →{" "}
        {p.lastDate}
      </p>

      {!current && (
        <div className="mt-2">
          <UseCustomerButton id={p.id} />
        </div>
      )}
    </div>
  );
}

export default function CustomerProfilesPage() {
  return <ForPickedCustomer render={ProfilesBody} />;
}

function ProfilesBody() {
  const profiles = allProfiles();
  const current = getCustomerId();

  return (
    <DevPage
      title="Customer profiles"
      intro={
        <>
          The {profiles.length} real customers prepared in <Code>data/demo/</Code>.{" "}
          <b>To use one:</b> tap <b>Use in app</b>, or <b>Switch</b> in the dark bar at the top. The
          choice is per device. Default when nothing is picked: <Code>DEMO_CUSTOMER_ID</Code> in{" "}
          <Code>.env.local</Code>.
        </>
      }
    >
      <Section
        title="How the types are decided"
        note={
          <>
            Rough labels to help pick customers — our own rules, not science. Checked top to bottom;
            edit in <Code>lib/data/profiles.ts</Code>.
          </>
        }
      >
        <ol className="list-decimal space-y-0.5 pl-5 text-sm">
          {SPENDING_TYPES.map((t) => (
            <li key={t.type}>
              <b>{t.label}</b> — {t.rule}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-muted">
          &ldquo;Keeps&rdquo; = share of income not spent. Investments and transfers to savings
          don&apos;t count as spending. All numbers are monthly averages over the customer&apos;s
          whole history.
        </p>
      </Section>

      {(() => {
        // WHY approved first, then by rejection reason: easy to pick one per outcome for the demo.
        const withLoan = profiles
          .filter((p) => p.mortgage)
          .sort((a, b) =>
            `${a.mortgage!.decision}${a.mortgage!.rejectionReason ?? ""}`.localeCompare(
              `${b.mortgage!.decision}${b.mortgage!.rejectionReason ?? ""}`,
            ),
          );
        if (withLoan.length === 0) return null;
        return (
          <Section
            title={`🏠 Home loan customers (${withLoan.length})`}
            note={
              <>
                Applied for a mortgage — they have data on the <b>Home loan</b> tab. &ldquo;Salary
                sweep&rdquo; customers move their pay out right away, so little spending shows: prefer
                the others for spending questions. Also listed under their spending type below.
              </>
            }
          >
            <div className="space-y-3">
              {withLoan.map((p) => (
                <ProfileCard key={p.id} p={p} current={p.id === current} />
              ))}
            </div>
          </Section>
        );
      })()}

      {SPENDING_TYPES.map((t) => {
        const group = profiles.filter((p) => p.type === t.type).sort((a, b) => a.age - b.age);
        if (group.length === 0) return null;
        return (
          <Section key={t.type} title={`${t.label} (${group.length})`} note={t.rule}>
            <div className="space-y-3">
              {group.map((p) => (
                <ProfileCard key={p.id} p={p} current={p.id === current} />
              ))}
            </div>
          </Section>
        );
      })}

      <Section title="Need different customers?">
        <p className="text-sm">
          Add any customer from the full dataset (needs <Code>data/raw/</Code>, see README):
        </p>
        <p className="mt-1">
          <Code>npm run prepare-data -- --customers CUST00042,CUST01234</Code>
        </p>
        <p className="mt-1 text-xs text-muted">They appear on this page automatically.</p>
      </Section>
    </DevPage>
  );
}
