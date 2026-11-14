/**
 * /customer_profiles — TEAM PAGE: all demo customers in data/demo/, grouped by
 * a rough spending type, so we can pick good ones for testing and the demo.
 * Logic lives in lib/data/profiles.ts.
 */
import { BASKETS, type Basket } from "@/lib/types";
import { getCustomerId } from "@/lib/data";
import { allProfiles, SPENDING_TYPES, type CustomerProfile } from "@/lib/data/profiles";
import { ageGroupFor } from "@/lib/insights/benchmarks";
import { CopyButton } from "@/components/dev/CopyButton";
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
  const line = `DEMO_CUSTOMER_ID=${p.id}`;
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

      <p className="mt-1 text-[11px] text-muted">
        Biggest everyday category: {p.topEveryday} · {p.transactions} transactions · {p.firstDate} →{" "}
        {p.lastDate}
      </p>

      <div className="mt-2 flex items-center gap-2">
        <Code>{line}</Code>
        <CopyButton text={line} />
      </div>
    </div>
  );
}

export default function CustomerProfilesPage() {
  const profiles = allProfiles();
  const current = getCustomerId();

  return (
    <DevPage
      title="Customer profiles"
      intro={
        <>
          The {profiles.length} real customers prepared in <Code>data/demo/</Code>.{" "}
          <b>To use one:</b> copy its line into <Code>.env.local</Code> (replace the old{" "}
          <Code>DEMO_CUSTOMER_ID</Code> line) and restart <Code>npm run dev</Code>.
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
