/**
 * /data — TEAM PAGE: what our data looks like, in one place.
 * Real examples come from the current demo customer (DEMO_CUSTOMER_ID).
 * Everything here is computed by the same code the app uses.
 */
import Link from "next/link";
import { BASKETS, BASKET_LABELS, type Basket, type ChartSpec, type Transaction } from "@/lib/types";
import {
  categoryKind,
  getCustomer,
  getCustomerId,
  getDataToday,
  getDatasetCategories,
  getTransactions,
  merchantType,
} from "@/lib/data";
import { BASKET_DESCRIPTIONS, classifyBasket, listMccOverrides } from "@/lib/data/baskets";
import { listToolNames, runTool } from "@/lib/ai/tools";
import { compareToPeers } from "@/lib/insights/benchmarks";
import { getMortgageSummary } from "@/lib/data/mortgage";
import { ChartCard } from "@/components/charts/ChartCard";
import { Code, DevPage, Section } from "@/components/dev/DevPage";
import { ForPickedCustomer } from "@/components/dev/ForPickedCustomer";

const eur = (n: number) => n.toLocaleString("fi-FI", { style: "currency", currency: "EUR" });

const BASKET_COLOR: Record<Basket, string> = {
  mandatory_regular: "var(--basket-regular)",
  mandatory_irregular: "var(--basket-irregular)",
  everyday: "var(--basket-everyday)",
};

const KIND_LABEL = { spending: "Spending", income: "Income", savings_move: "Savings move" };

/** The raw columns of tx_junction_transactions.csv and what they mean. */
const FIELDS: [string, string][] = [
  ["customer_id", "Who (e.g. CUST02478)"],
  ["bank_account_id", "Which account"],
  ["tx_date / tx_timestamp", "When"],
  ["category", "One of 15 categories (list below)"],
  ["tx_amount_eur", "Amount. Negative = money out, positive = money in"],
  ["balance_after_eur", "Account balance right after"],
  ["transaction_type", "purchase, salary, housing_payment, utilities_payment, …"],
  ["merchant_id", "Which shop (card purchases only)"],
  ["mcc_code", "Type of shop, e.g. 5411 supermarket, 4121 taxi"],
];

/** The mortgage files (data/raw/mtg_*.csv) — 200 of the 5,100 customers applied. */
const MORTGAGE_FILES: [string, string][] = [
  [
    "mtg_tx_customer_link_and_final_mtg_infio.csv",
    "One row per application: links the mortgage id (C0025) to our customer id (CUST03878) + final decision, rejection reason, price, loan, equity, collateral, required monthly income, loan-to-value. 150 approved, 50 rejected.",
  ],
  [
    "mtg_negotiation_history.csv",
    "11–25 events per application (3,452 in total): application started → homes added → loan calculated → costs recorded → collateral valued → decision. Each has a plain-English note.",
  ],
];

/** Pick ~8 recent transactions that show the variety in the data. */
function sampleTransactions(all: Transaction[]): Transaction[] {
  const recentFirst = [...all].reverse();
  const wanted: ((t: Transaction) => boolean)[] = [
    (t) => t.category === "Salary",
    (t) => t.category === "Housing",
    (t) => t.category === "Utilities",
    (t) => t.category === "Groceries",
    (t) => t.mccCode === "5814" || t.category === "Restaurants",
    (t) => t.mccCode === "4121",
    (t) => t.category === "Health",
    (t) => t.category === "Invest Deposit" || t.category === "Entertainment",
  ];
  const picked: Transaction[] = [];
  for (const test of wanted) {
    const t = recentFirst.find((x) => test(x) && !picked.includes(x));
    if (t) picked.push(t);
  }
  // Fill up to 8 with other categories if some kinds were missing.
  for (const t of recentFirst) {
    if (picked.length >= 8) break;
    if (!picked.some((p) => p.category === t.category)) picked.push(t);
  }
  return picked.sort((a, b) => b.date.localeCompare(a.date));
}

/** Example charts, made exactly the way the AI makes them (show_chart tool). */
const CHART_EXAMPLES: { what: string; args: Record<string, unknown> }[] = [
  {
    what: "Basket split — the 3 baskets as a share of spending",
    args: {
      chart_type: "pie",
      title: "This month by basket",
      data_tool: "basket_breakdown",
      data_args: { period: "this_month" },
    },
  },
  {
    what: "Spending by category",
    args: {
      chart_type: "bar",
      title: "Last month by category",
      data_tool: "spend_by_category",
      data_args: { period: "last_month" },
    },
  },
  {
    what: "Trend over time (week by week)",
    args: {
      chart_type: "line",
      title: "Weekly spending, last 90 days",
      data_tool: "spend_over_time",
      data_args: { period: "last_90_days", group_by: "week" },
    },
  },
  {
    what: "One category over time (month by month)",
    args: {
      chart_type: "bar",
      title: "Restaurants per month",
      data_tool: "spend_over_time",
      data_args: { period: "all", group_by: "month", category: "restaurants" },
    },
  },
  {
    what: "Merchant type via MCC code (e.g. taxis inside Transportation)",
    args: {
      chart_type: "table",
      title: "Taxi, last 90 days",
      data_tool: "spend_by_category",
      data_args: { period: "last_90_days", category: "taxi" },
    },
  },
  {
    what: "Plain table of numbers",
    args: {
      chart_type: "table",
      title: "Last month, all categories",
      data_tool: "spend_by_category",
      data_args: { period: "last_month" },
    },
  },
  {
    what: "Income vs spending — what you keep",
    args: {
      chart_type: "bar",
      title: "Last month: income vs spending",
      data_tool: "income_summary",
      data_args: { period: "last_month" },
    },
  },
  {
    what: "Two periods side by side",
    args: {
      chart_type: "bar",
      title: "Last month vs this month",
      data_tool: "compare_periods",
      data_args: { period: "last_month", period_b: "this_month" },
    },
  },
  {
    what: "You vs people your age (from benchmarks)",
    args: {
      chart_type: "bar",
      title: "You vs your age group (€/month)",
      data_tool: "compare_to_peers",
      data_args: {},
    },
  },
  {
    what: "Account balance over time — the squeeze before payday",
    args: {
      chart_type: "line",
      title: "Balance, last 90 days",
      data_tool: "balance_over_time",
      data_args: { period: "last_90_days" },
    },
  },
  {
    what: "Where money slips away (everyday basket, per month)",
    args: {
      chart_type: "bar",
      title: "Everyday spending per month",
      data_tool: "everyday_leaks",
      data_args: { period: "last_90_days" },
    },
  },
  {
    what: "Bills, savings and regular habits",
    args: {
      chart_type: "table",
      title: "Regular payments (per month)",
      data_tool: "recurring_payments",
      data_args: {},
    },
  },
  {
    what: "What if — cut restaurants by 20 %",
    args: {
      chart_type: "bar",
      title: "Restaurants: now vs −20 %",
      data_tool: "what_if",
      data_args: { category: "restaurants", change_percent: -20 },
    },
  },
  {
    what: "Safe to spend this week",
    args: {
      chart_type: "table",
      title: "Safe to spend",
      data_tool: "safe_to_spend",
      data_args: { days: 7 },
    },
  },
  {
    what: "Surprise costs per month (basket 2)",
    args: {
      chart_type: "bar",
      title: "Surprise costs per month",
      data_tool: "irregular_buffer",
      data_args: {},
    },
  },
  {
    what: "Spending calendar (heatmap) — tap it, switch months, tap a day",
    args: {
      chart_type: "heatmap",
      title: "Spending calendar",
      data_tool: "spend_over_time",
      data_args: { period: "all" },
    },
  },
  {
    what: "Where money slips away — yearly cost, habits with 'skip one', drip jar",
    args: {
      chart_type: "leaks",
      title: "Where my money slips away 💸",
      data_tool: "everyday_leaks",
      data_args: { period: "last_90_days" },
    },
  },
  {
    what: "The 3 baskets with categories — tap a category to see what's inside",
    args: {
      chart_type: "baskets",
      title: "Your spending types",
      data_tool: "basket_details",
      data_args: { period: "this_month" },
    },
  },
  {
    what: "Month so far vs last month, with projection — tap for details",
    args: {
      chart_type: "cumulative",
      title: "This month so far",
      data_tool: "month_progress",
      data_args: {},
    },
  },
  {
    what: "Biggest purchases",
    args: {
      chart_type: "table",
      title: "Biggest purchases, last 90 days",
      data_tool: "largest_transactions",
      data_args: { period: "last_90_days" },
    },
  },
];

export default function DataPage() {
  return <ForPickedCustomer render={DataBody} />;
}

function DataBody() {
  const customer = getCustomer();
  const mortgage = getMortgageSummary();
  const all = getTransactions();
  const samples = sampleTransactions(all);
  const categories = getDatasetCategories();
  const mccOverrides = listMccOverrides();
  const peers = compareToPeers();
  const tools = listToolNames();
  const charts = CHART_EXAMPLES.map((c) => ({
    ...c,
    spec: runTool("show_chart", c.args).chart as ChartSpec,
  }));

  return (
    <DevPage
      title="Data overview"
      intro={
        <>
          Showing demo customer <b>{getCustomerId()}</b> (age {customer.age}, {all.length}{" "}
          transactions, {all[0]?.date} → {getDataToday()}). Change it with <b>Switch</b> in the
          dark bar at the top, or on{" "}
          <Link className="text-accent underline" href="/customer_profiles">
            customer profiles
          </Link>
          .
        </>
      }
    >
      {/* ── 1. Example transactions ─────────────────────────────────── */}
      <Section
        title="1. Example transactions"
        note="8 real rows from this customer, picked to show the variety. The last column (basket) is OUR label — it's not in the dataset."
      >
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[560px] text-xs">
            <thead className="text-left text-muted">
              <tr>
                <th className="py-1 pr-2">Date</th>
                <th className="pr-2">Category</th>
                <th className="pr-2">Shop type (MCC)</th>
                <th className="pr-2 text-right">Amount</th>
                <th className="pr-2">Type</th>
                <th>Basket</th>
              </tr>
            </thead>
            <tbody>
              {samples.map((t, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-1.5 pr-2 whitespace-nowrap">{t.date}</td>
                  <td className="pr-2">{t.category}</td>
                  <td className="pr-2 text-muted">
                    {t.mccCode ? `${merchantType(t.mccCode) ?? "?"} (${t.mccCode})` : "–"}
                  </td>
                  <td
                    className={`pr-2 text-right tabular-nums ${t.amountEur > 0 ? "text-accent" : ""}`}
                  >
                    {eur(t.amountEur)}
                  </td>
                  <td className="pr-2 text-muted">{t.transactionType}</td>
                  <td>
                    {categoryKind(t.category) === "spending" ? (
                      <span className="flex items-center gap-1 whitespace-nowrap">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: BASKET_COLOR[t.basket] }}
                        />
                        {BASKET_LABELS[t.basket]}
                      </span>
                    ) : (
                      <span className="text-muted">
                        — ({KIND_LABEL[categoryKind(t.category)].toLowerCase()})
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-accent">All fields in the raw data</summary>
          <ul className="mt-2 space-y-1">
            {FIELDS.map(([f, m]) => (
              <li key={f}>
                <Code>{f}</Code> — {m}
              </li>
            ))}
          </ul>
        </details>
      </Section>

      {/* ── 2. The 3 baskets ────────────────────────────────────────── */}
      <Section
        title="2. The 3 baskets"
        note={
          <>
            From the S-Bank challenge brief. Which category goes where is OUR choice — edit{" "}
            <Code>lib/data/baskets.ts</Code>.
          </>
        }
      >
        <div className="space-y-3">
          {BASKETS.map((b) => {
            const cats = categories
              .filter(
                (c) => categoryKind(c.category) === "spending" && classifyBasket(c.category) === b,
              )
              .map((c) => c.category);
            const overrides = mccOverrides.filter((o) => o.basket === b);
            return (
              <div key={b} className="rounded-lg border border-line p-3">
                <div className="flex items-center gap-2 font-medium">
                  <span className="h-3 w-3 rounded-full" style={{ background: BASKET_COLOR[b] }} />
                  {BASKET_LABELS[b]}
                </div>
                <p className="mt-1 text-sm">{BASKET_DESCRIPTIONS[b].meaning}</p>
                <p className="text-xs text-muted">e.g. {BASKET_DESCRIPTIONS[b].example}</p>
                <p className="mt-2 text-xs">
                  <b>Categories:</b> {cats.join(", ") || "–"}
                  {overrides.map((o) => (
                    <span key={o.mcc}>
                      {" "}
                      + {merchantType(o.mcc)} (MCC {o.mcc}, from any category)
                    </span>
                  ))}
                </p>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── 3. The 15 categories ────────────────────────────────────── */}
      <Section
        title={`3. The ${categories.length} categories`}
        note="Straight from the dataset's category column. Count = transactions across all 5,100 customers."
      >
        {categories.length === 0 ? (
          <p className="text-sm text-muted">
            No category list yet — run <Code>npm run prepare-data</Code>.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1">Category</th>
                <th>Kind</th>
                <th>Basket</th>
                <th className="text-right">Count</th>
              </tr>
            </thead>
            <tbody>
              {categories.map(({ category, count }) => {
                const kind = categoryKind(category);
                const basket = classifyBasket(category);
                return (
                  <tr key={category} className="border-t border-line">
                    <td className="py-1.5">{category}</td>
                    <td className="text-xs text-muted">{KIND_LABEL[kind]}</td>
                    <td className="text-xs">
                      {kind === "spending" ? (
                        <span className="flex items-center gap-1">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: BASKET_COLOR[basket] }}
                          />
                          {BASKET_LABELS[basket]}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="text-right tabular-nums text-xs">
                      {count.toLocaleString("fi-FI")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* ── 4. Charts ───────────────────────────────────────────────── */}
      <Section
        title="4. Charts the app can show"
        note={
          <>
            Made with the same <Code>show_chart</Code> tool the AI uses. Tap a chart to open it full
            screen.
          </>
        }
      >
        <div className="space-y-4">
          {charts.map((c) => (
            <div key={c.what}>
              <p className="text-sm font-medium">{c.what}</p>
              <p className="text-xs text-muted">
                type <Code>{String(c.args.chart_type)}</Code> · tool{" "}
                <Code>{String(c.args.data_tool)}</Code> · args{" "}
                <Code>{JSON.stringify(c.args.data_args)}</Code>
              </p>
              <ChartCard spec={c.spec} />
            </div>
          ))}
        </div>
      </Section>

      {/* ── 4b. AI tools ─────────────────────────────────────────────── */}
      <Section
        title="4b. Tools the AI can call"
        note={
          <>
            Defined in <Code>lib/ai/tools.ts</Code>. The AI can combine several for one question.
            &ldquo;chart&rdquo; = can be drawn with <Code>show_chart</Code>.
          </>
        }
      >
        <ul className="space-y-1.5 text-sm">
          {tools.map((t) => (
            <li key={t.name}>
              <Code>{t.name}</Code>
              {t.chartable && <span className="ml-1 text-[10px] text-accent">chart</span>}
              <div className="text-xs text-muted">{t.description}</div>
            </li>
          ))}
        </ul>
      </Section>

      {/* ── 5. Peer comparison ──────────────────────────────────────── */}
      <Section
        title="5. Compared with people the same age"
        note={
          <>
            From{" "}
            <a
              className="text-accent underline"
              href="/api/data-file?path=benchmarks.json"
              target="_blank"
            >
              data/benchmarks.json
            </a>{" "}
            (all 5,100 customers). Not shown in the chat yet. Code: <Code>compareToPeers()</Code> in{" "}
            <Code>lib/insights/benchmarks.ts</Code>.
          </>
        }
      >
        {!peers ? (
          <p className="text-sm text-muted">
            No benchmarks yet — run <Code>npm run benchmarks</Code>.
          </p>
        ) : (
          <>
            <p className="mb-2 text-xs">
              Age group <b>{peers.ageGroup}</b> · {peers.peers} people · euros per month
            </p>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1">Category</th>
                  <th className="text-right">This customer</th>
                  <th className="text-right">Typical (median)</th>
                  <th className="text-right">Normal range</th>
                </tr>
              </thead>
              <tbody>
                {peers.rows.map((r) => (
                  <tr key={r.category} className="border-t border-line">
                    <td className="py-1.5">{r.category}</td>
                    <td className="text-right tabular-nums">{Math.round(r.youPerMonth)}</td>
                    <td className="text-right tabular-nums text-muted">
                      {Math.round(r.peersMedian)}
                    </td>
                    <td className="text-right tabular-nums text-xs text-muted">
                      {Math.round(r.peersTypicalRange[0])}–{Math.round(r.peersTypicalRange[1])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Section>

      {/* ── 6. Home loan ────────────────────────────────────────────── */}
      <Section
        title="6. Home loan (mortgage) data"
        note={
          <>
            Shown on the <b>Home loan</b> tab and via the AI tool <Code>mortgage_status</Code>. Code:{" "}
            <Code>lib/data/mortgage.ts</Code>. Pick a customer with a loan on{" "}
            <Link className="text-accent underline" href="/customer_profiles">
              Customer profiles
            </Link>
            .
          </>
        }
      >
        <ul className="space-y-1.5 text-xs">
          {MORTGAGE_FILES.map(([f, m]) => (
            <li key={f}>
              <Code>{f}</Code> — {m}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">
          ⚠️ The bank&apos;s decision can&apos;t be worked out from the transactions (approved and
          rejected customers earn about the same vs. the &ldquo;required income&rdquo;). We show the
          decision and reason as recorded and never make up our own. Mortgage payments don&apos;t
          appear in the transactions either.
        </p>
        {mortgage ? (
          <p className="mt-2 text-sm">
            This customer: application <b>{mortgage.mortgageId}</b>, <b>{mortgage.decision}</b>
            {mortgage.rejectionReason && ` (${mortgage.rejectionReason})`} · loan{" "}
            {eur(mortgage.loanEur)} · own money {eur(mortgage.equityEur)} ·{" "}
            {mortgage.timeline.length} timeline steps.
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">This customer has no mortgage application.</p>
        )}
      </Section>
    </DevPage>
  );
}
