/**
 * TOOLS — the functions the AI is allowed to call. Owner: AI person.
 *
 * HOW IT WORKS:
 * 1. We send the LLM the list of tools below (name + description + JSON schema).
 * 2. The LLM answers "call spend_by_category with {period: 'last_month'}".
 * 3. runTool() runs our real data function and returns the result as JSON.
 * 4. The LLM reads the result and writes the answer. It can call several
 *    tools in a row (lib/ai/chat.ts) to answer bigger questions.
 *
 * WHY: the AI never does math on raw transactions. Numbers come from tested
 * code in lib/data and lib/insights, so the coach is trustworthy.
 *
 * TWO KINDS OF TOOLS (team decision):
 * - building blocks: small, flexible (spend_by_category, income_summary, …)
 * - ready-made insights: answer the challenge's flagship questions in one
 *   step (spender_profile, everyday_leaks, what_if, safe_to_spend, …)
 * - home loan: mortgage_status (+ mortgage_financing for charts), from
 *   lib/data/mortgage.ts. { hasMortgage: false } for customers who never applied.
 *
 * TO ADD A TOOL: write the function in lib/data or lib/insights, then add one
 * entry to TOOLS below. If it returns `rows`, set chartable: true and it can
 * be drawn with show_chart automatically.
 */
import type {
  Basket,
  ChartRow,
  ChartSpec,
  ChartType,
  DateRange,
  MoneyTone,
  WhatIf,
} from "@/lib/types";
import type { ToolDefinition } from "./llm";
import { BASKETS, BASKET_LABELS } from "@/lib/types";
import {
  PERIODS,
  basketBreakdown,
  listTransactions,
  periodToRange,
  spendByCategory,
  spendOverTime,
  type Period,
} from "@/lib/data";
import {
  balanceOverTime,
  comparePeriods,
  incomeSummary,
  largestTransactions,
  transactionRows,
} from "@/lib/data/money";
import { compareToPeers, getBenchmarks } from "@/lib/insights/benchmarks";
import { everydayLeaks } from "@/lib/insights/leaks";
import { irregularBuffer } from "@/lib/insights/irregular";
import { monthProgress } from "@/lib/insights/monthProgress";
import { basketTree } from "@/lib/insights/basketTree";
import { recurringPayments } from "@/lib/insights/recurring";
import { safeToSpend } from "@/lib/insights/safeToSpend";
import { spenderProfile } from "@/lib/insights/spenderProfile";
import { whatIf } from "@/lib/insights/whatIf";
import { getMortgageSummary } from "@/lib/data/mortgage";
import { getWhatIf, parseCutPct, parseMonths } from "@/lib/insights/whatIfForecast";
import { availableNames, resolveTarget, targetFromNames } from "@/lib/insights/targets";

type Args = Record<string, unknown>;

/** What a tool returns. `rows` (+ optional unit/seriesNames) make it chartable. */
type ToolOutput = Record<string, unknown> & {
  rows?: ChartRow[];
  unit?: string;
  seriesNames?: [string, string];
  facts?: ChartSpec["facts"];
  /** List shown under the chart (ChartSpec.items). Not sent to the LLM. */
  chartList?: ChartSpec["items"];
  monthNav?: ChartSpec["monthNav"];
  /** Basket tree for the "baskets" chart (ChartSpec.baskets). */
  basketTree?: ChartSpec["baskets"];
  /** Screen data for the "leaks" chart (ChartSpec.leaks). */
  view?: ChartSpec["leaks"];
  periodLabel?: string;
  /** Opens the what-if view (ChatMessage.whatIf). Not sent to the LLM. */
  whatIf?: WhatIf;
};

type Tool = {
  name: string;
  description: string;
  properties: Record<string, unknown>;
  required?: string[];
  chartable: boolean;
  run: (args: Args) => ToolOutput;
};

// ─── Argument helpers ────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const periodProps = {
  period: {
    type: "string",
    enum: [...PERIODS],
    description: "Named time period, relative to today in the data.",
  },
  from: { type: "string", description: "Optional exact start date YYYY-MM-DD. Overrides period." },
  to: { type: "string", description: "Optional exact end date YYYY-MM-DD. Overrides period." },
};

/**
 * WHY validate: LLMs sometimes send wrong or missing arguments. We fall back
 * to safe defaults instead of crashing, and the LLM sees what range was used.
 */
function rangeFrom(args: Args, fallback: Period, keys = ["period", "from", "to"]): DateRange {
  const [p, f, t] = keys;
  const period = (PERIODS as readonly string[]).includes(String(args[p]))
    ? (args[p] as Period)
    : fallback;
  const range = periodToRange(period);
  if (typeof args[f] === "string" && DATE_RE.test(args[f] as string))
    range.from = args[f] as string;
  if (typeof args[t] === "string" && DATE_RE.test(args[t] as string)) range.to = args[t] as string;
  return range;
}

function optString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function optBasket(v: unknown): Basket | undefined {
  return BASKETS.includes(v as Basket) ? (v as Basket) : undefined;
}

function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}

/** "2026-08-01".."2026-08-31" → "1.8.–31.8.2026" (for chart series names). */
function rangeLabel(r: DateRange): string {
  const f = r.from.split("-").map(Number);
  const t = r.to.split("-").map(Number);
  return `${f[2]}.${f[1]}.–${t[2]}.${t[1]}.${t[0]}`;
}

// ─── The tools ───────────────────────────────────────────────────────────

const TOOLS: Tool[] = [
  // ── Building blocks ────────────────────────────────────────────────────
  {
    name: "spend_by_category",
    description:
      "Total euros spent per category in a period, biggest first. Optional `category` filters by category or merchant type (e.g. 'taxi', 'restaurants').",
    properties: { ...periodProps, category: { type: "string" } },
    required: ["period"],
    chartable: true,
    run: (a) => {
      const range = rangeFrom(a, "last_30_days");
      return { range, rows: spendByCategory(range, optString(a.category)) };
    },
  },
  {
    name: "basket_breakdown",
    description:
      "Euros spent in each of the 3 baskets (mandatory & regular, mandatory & irregular, everyday) in a period.",
    properties: { ...periodProps },
    required: ["period"],
    chartable: true,
    run: (a) => {
      const range = rangeFrom(a, "last_30_days");
      const totals = basketBreakdown(range);
      return { range, rows: BASKETS.map((b) => ({ label: BASKET_LABELS[b], value: totals[b] })) };
    },
  },
  {
    name: "basket_details",
    description:
      "The 3 baskets in a period, each split into categories, and each category into merchant types " +
      "(e.g. Groceries → Supermarket, Convenience store), with euros and counts, biggest first. " +
      "Use with show_chart chart_type 'baskets'.",
    properties: { ...periodProps },
    required: ["period"],
    chartable: true,
    run: (a) => {
      const range = rangeFrom(a, "this_month");
      const t = basketTree(range);
      const d = (s: string) => `${Number(s.slice(8))}.${Number(s.slice(5, 7))}.`;
      return {
        range,
        totalEur: t.total,
        // WHY no single purchases for the AI: too long; the screen gets them (basketTree).
        baskets: t.baskets.map((b) => ({
          ...b,
          categories: b.categories.map((c) => ({
            ...c,
            merchants: c.merchants.map(({ name, total, count }) => ({ name, total, count })),
          })),
        })),
        rows: t.baskets.map((b) => ({ label: b.label, value: b.total })),
        basketTree: t.baskets,
        periodLabel: `${d(range.from)}–${d(range.to)}${range.to.slice(0, 4)}`,
      };
    },
  },
  {
    name: "spend_over_time",
    description:
      "Euros spent over time, grouped by day, week or month. Optional `category` filter. Good for trends.",
    properties: {
      ...periodProps,
      group_by: { type: "string", enum: ["day", "week", "month"] },
      category: { type: "string" },
    },
    required: ["period", "group_by"],
    chartable: true,
    run: (a) => {
      const range = rangeFrom(a, "last_90_days");
      const g = a.group_by;
      const groupBy = g === "day" || g === "week" || g === "month" ? g : "week";
      return { range, rows: spendOverTime(range, groupBy, optString(a.category)) };
    },
  },
  {
    name: "list_transactions",
    description:
      "The most recent individual transactions in a period (newest first). Optional category or basket filter.",
    properties: {
      ...periodProps,
      category: { type: "string" },
      basket: { type: "string", enum: [...BASKETS] },
      limit: { type: "number", description: "Max rows, default 10, max 30." },
    },
    required: ["period"],
    chartable: false,
    run: (a) => {
      const range = rangeFrom(a, "last_30_days");
      const txs = listTransactions(range, {
        category: optString(a.category),
        basket: optBasket(a.basket),
        limit: clampNumber(a.limit, 1, 30, 10),
      });
      // WHY trimmed fields: fewer tokens, and the LLM only needs these.
      return {
        range,
        transactions: txs.map((t) => ({
          date: t.date,
          category: t.category,
          amountEur: t.amountEur,
          basket: t.basket,
        })),
      };
    },
  },
  {
    name: "income_summary",
    description:
      "Income vs spending in a period, how much was kept (and as a share of income), and how much went to savings/investments.",
    properties: { ...periodProps },
    required: ["period"],
    chartable: true,
    run: (a) => incomeSummary(rangeFrom(a, "last_month")),
  },
  {
    name: "compare_periods",
    description:
      "Compare spending per category between two periods, e.g. this month vs last month. First period = period/from/to, second = period_b/from_b/to_b. Optional category filter. First row is the total.",
    properties: {
      ...periodProps,
      period_b: {
        type: "string",
        enum: [...PERIODS],
        description: "Second period to compare with.",
      },
      from_b: { type: "string", description: "Optional exact start date of the second period." },
      to_b: { type: "string", description: "Optional exact end date of the second period." },
      category: { type: "string" },
    },
    required: ["period", "period_b"],
    chartable: true,
    run: (a) => {
      const A = rangeFrom(a, "last_month");
      const B = rangeFrom(a, "this_month", ["period_b", "from_b", "to_b"]);
      return {
        first: A,
        second: B,
        rows: comparePeriods(A, B, optString(a.category)),
        seriesNames: [rangeLabel(A), rangeLabel(B)] as [string, string],
      };
    },
  },
  {
    name: "largest_transactions",
    description:
      "The biggest single spending transactions in a period, biggest first. Optional basket filter.",
    properties: {
      ...periodProps,
      basket: { type: "string", enum: [...BASKETS] },
      limit: { type: "number", description: "How many, default 10, max 20." },
    },
    required: ["period"],
    chartable: true,
    run: (a) => {
      const range = rangeFrom(a, "last_90_days");
      const txs = largestTransactions(range, {
        basket: optBasket(a.basket),
        limit: clampNumber(a.limit, 1, 20, 10),
      });
      return { range, rows: transactionRows(txs) };
    },
  },
  {
    name: "balance_over_time",
    description:
      "Account balance at the end of each day, plus the lowest and highest point. Shows the squeeze before payday.",
    properties: { ...periodProps },
    required: ["period"],
    chartable: true,
    run: (a) => balanceOverTime(rangeFrom(a, "last_90_days")),
  },

  // ── Ready-made insights ────────────────────────────────────────────────
  {
    name: "recurring_payments",
    description:
      "Fixed bills (rent, utilities), subscriptions, automatic savings and regular habits (same shop most months) over the last 12 months, with typical day of month and cost per month.",
    properties: {},
    chartable: true,
    run: () => recurringPayments(),
  },
  {
    name: "compare_to_peers",
    description:
      "The user's average monthly spending per category vs the typical (median) person of the same age group, from all 5,100 customers. Includes the normal range.",
    properties: {},
    chartable: true,
    run: () => {
      const c = compareToPeers();
      if (!c) return { error: "No benchmarks file (run npm run benchmarks)." };
      // WHY difference + verdict computed here: the model subtracted badly and
      // called €89 vs €96 "more". The typical range (p25–p75) decides the verdict.
      const byCategory = c.rows.map((r) => ({
        category: r.category,
        differenceVsTypicalEur: Math.round((r.youPerMonth - r.peersMedian) * 100) / 100,
        verdict:
          r.youPerMonth > r.peersTypicalRange[1]
            ? "above typical range"
            : r.youPerMonth < r.peersTypicalRange[0]
              ? "below typical range"
              : "within typical range",
      }));
      // WHY a total: "do I spend more than people my age?" is about the whole
      // month, and without it the model added up the categories itself.
      const youTotal = Math.round(c.rows.reduce((sum, r) => sum + r.youPerMonth, 0) * 100) / 100;
      const peersTotal = getBenchmarks()?.groups[c.ageGroup]?.totalSpendingPerMonth;
      return {
        ...c,
        total: {
          youPerMonthEur: youTotal,
          peersMedianEur: peersTotal?.median,
          peersTypicalRangeEur: peersTotal ? [peersTotal.p25, peersTotal.p75] : undefined,
          differenceVsTypicalEur: peersTotal
            ? Math.round((youTotal - peersTotal.median) * 100) / 100
            : undefined,
        },
        byCategory,
        rows: c.rows.map((r) => ({
          label: r.category,
          value: r.youPerMonth,
          value2: r.peersMedian,
        })),
        seriesNames: ["You", `Typical age ${c.ageGroup}`] as [string, string],
      };
    },
  },
  {
    name: "spender_profile",
    description:
      "Answers 'What kind of spender am I?': spending type, basket split (%), kept share of income, where the user is clearly above/below people their age, and the small-purchase effect.",
    properties: {},
    chartable: true,
    run: () => spenderProfile() ?? { error: "No data for this customer." },
  },
  {
    name: "everyday_leaks",
    description:
      "Where money 'slips through your fingers': everyday-basket spending per purchase type (per month, per year, times per month) and how much small purchases (≤ max_eur, default 20) add up to.",
    properties: {
      ...periodProps,
      max_eur: { type: "number", description: "What counts as a small purchase. Default 20." },
    },
    required: ["period"],
    chartable: true,
    run: (a) => everydayLeaks(rangeFrom(a, "last_90_days"), clampNumber(a.max_eur, 1, 500, 20)),
  },
  {
    // The what-if VIEW (chart + Month / 3 / 6 months toggle). The older what_if below
    // stays as a sub-tool (per-month / per-year saving) for a later section of that view.
    name: "what_if_spending",
    description:
      "Main tool for 'what if I spent less on X?'. Predicts the next 1, 3 or 6 months as the user's average month " +
      "on X (last 12 months, or all history if shorter; see average) × months, unchanged vs with a cut, and opens " +
      "a what-if chart of the last 1, 3 or 6 months for the user. lastYear = same months a year ago (info only). category: e.g. 'restaurants', " +
      "'eating out' (= restaurants + cafes + takeaway), 'groceries', 'taxi'. only: optional list of exact " +
      "categories or merchant types to narrow it, e.g. ['Cafes'] or ['Fast food'] (the result's breakdown shows " +
      "what is inside). cut_pct: 5, 10 or 20, default 5 — the % the view opens on; the result's cutOptions " +
      "has the saving for all three. months: 1, 3 or 6, default 1 — only set it if the user names " +
      "a period. monthsWithData in the result says which periods have data.",
    properties: {
      category: { type: "string" },
      only: { type: "array", items: { type: "string" } },
      cut_pct: { type: "number" },
      months: { type: "number", enum: [1, 3, 6] },
    },
    required: ["category"],
    chartable: false,
    run: (a) => {
      const only = Array.isArray(a.only) ? a.only.map(String).filter(Boolean) : [];
      const target = only.length ? targetFromNames(only) : resolveTarget(String(a.category ?? ""));
      if (!target) {
        // WHY list the options: the LLM can retry with a valid name instead of giving up.
        return { error: "Unknown category", available: availableNames() };
      }
      // WHY default 1: the what-if view always opens on Month unless the user named a period.
      const w = getWhatIf(target, parseMonths(a.months) ?? 1, parseCutPct(a.cut_pct));
      // WHY no points for the LLM: it only needs totals + breakdown to write its sentence.
      const { points: _points, ...summary } = w;
      void _points;
      return { ...summary, whatIf: w };
    },
  },
  {
    name: "what_if",
    description:
      "Answers 'How much could I save if I cut X by N%?'. Uses average monthly spending over the period (default last 90 days) for a category/merchant type or a basket. change_percent: -20 = spend 20% less.",
    properties: {
      ...periodProps,
      change_percent: { type: "number", description: "e.g. -20 for a 20% cut." },
      category: { type: "string", description: "e.g. 'restaurants', 'taxi'." },
      basket: { type: "string", enum: [...BASKETS] },
    },
    required: ["change_percent"],
    chartable: true,
    run: (a) =>
      whatIf({
        range: rangeFrom(a, "last_90_days"),
        changePercent: clampNumber(a.change_percent, -100, 500, -20),
        category: optString(a.category),
        basket: optBasket(a.basket),
      }),
  },
  {
    name: "safe_to_spend",
    description:
      "Answers 'What is safe for me to spend this week?': balance minus fixed costs and a surprise buffer until the next payday, per day and for the requested number of days (default 7). All parts are returned so you can explain them.",
    properties: { days: { type: "number", description: "Number of days, default 7." } },
    chartable: true,
    run: (a) => safeToSpend(clampNumber(a.days, 1, 31, 7)),
  },
  {
    name: "month_progress",
    description:
      "Answers 'How am I doing this month?': running total of spending per day this month vs last month, spent so far, last month by the same day, and a projection to month end (variable spending pace + fixed bills still due). Also the biggest expenses this month. Optional month 'YYYY-MM' for a past month.",
    properties: {
      month: { type: "string", description: "Optional 'YYYY-MM'. Default: the current month." },
    },
    chartable: true,
    run: (a) => {
      const m = monthProgress(optString(a.month));
      // WHY top 10 for the AI: the screen gets every expense (chartList),
      // the model only needs the big ones.
      return {
        ...m,
        biggestExpenses: m.biggestExpenses.slice(0, 10),
        chartList: m.biggestExpenses,
      };
    },
  },
  {
    name: "irregular_buffer",
    description:
      "Surprise costs (mandatory & irregular basket: health, home & tech) month by month over the whole history, with average, worst month, and a suggested monthly set-aside and emergency buffer.",
    properties: {},
    chartable: true,
    run: () => irregularBuffer(),
  },

  // ── Home loan ──────────────────────────────────────────────────────────
  {
    name: "mortgage_status",
    description:
      "The user's home loan (mortgage) application: the bank's decision and rejection reason, property, loan, " +
      "own money (equity), loan-to-value, collateral, costs the bank recorded, required monthly income, the user's " +
      "average monthly income and spending (last 12 months), and a timeline. hasMortgage=false if they never applied.",
    properties: {},
    chartable: false,
    run: () => {
      const m = getMortgageSummary();
      if (!m) return { hasMortgage: false };
      return {
        hasMortgage: true,
        ...m,
        // WHY: the bank's verdict is final data; the AI must not invent its own (see prompt).
        note: "decision and rejectionReason are the bank's own record. requiredMonthlyIncomeEur is the bank's figure.",
        // undefined fields are dropped by JSON.stringify (fewer tokens, no long notes)
        timeline: m.timeline.map((e) => ({ ...e, note: undefined, time: undefined })),
      };
    },
  },
  {
    name: "mortgage_financing",
    description:
      "Loan vs own money (equity) for the user's home, as chart rows. Use with show_chart (pie or bar). No period needed.",
    properties: {},
    chartable: true,
    run: () => {
      const m = getMortgageSummary();
      return {
        rows: m
          ? [
              { label: "Loan", value: m.loanEur },
              { label: "Own money", value: m.equityEur },
            ]
          : [],
      };
    },
  },
];

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));
const CHART_TYPES = [
  "bar",
  "line",
  "pie",
  "table",
  "heatmap",
  "cumulative",
  "baskets",
  "leaks",
] as const;
const CHARTABLE = TOOLS.filter((t) => t.chartable).map((t) => t.name);

/** Every argument any chartable tool accepts — show_chart's data_args schema. */
const ALL_DATA_ARG_PROPS = Object.assign(
  {},
  ...TOOLS.filter((t) => t.chartable).map((t) => t.properties),
) as Record<string, unknown>;

// ─── Definitions sent to the LLM ─────────────────────────────────────────

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  ...TOOLS.map((t): ToolDefinition => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: { type: "object", properties: t.properties, required: t.required ?? [] },
    },
  })),
  {
    type: "function",
    function: {
      name: "show_chart",
      description:
        "Show the user a chart or table in the chat. You choose the chart type, title and which data tool + arguments " +
        "provide the numbers. The server runs that tool itself, so the chart is always exact. " +
        "Use 'line' for balance/trends over time, 'pie' for shares, 'bar' for comparisons, 'table' for lists, " +
        "'heatmap' for a GitHub-style calendar of daily spending (which days/weeks money goes out; the user can tap " +
        "days and switch months). For 'heatmap' the server always uses daily spending — just pass period/from/to " +
        "and optionally category in data_args (data_tool can be spend_over_time). " +
        "'cumulative' = month so far vs last month with a projection to month end (data_tool month_progress, " +
        "optional month 'YYYY-MM'). " +
        "'baskets' = the 3 baskets with their categories; the user can tap a category to see what's inside " +
        "(data_tool basket_details, period). " +
        "'leaks' = where money slips away: yearly cost of small purchases, habit cards with 'skip one' savings " +
        "and a jar of every small purchase (data_tool everyday_leaks).",
      parameters: {
        type: "object",
        properties: {
          chart_type: { type: "string", enum: [...CHART_TYPES] },
          title: { type: "string" },
          data_tool: { type: "string", enum: CHARTABLE },
          data_args: {
            type: "object",
            description: "Arguments for data_tool, same as calling it directly.",
            // WHY listed explicitly: some models (e.g. Gemini) reject an
            // "object" parameter that has no properties.
            properties: ALL_DATA_ARG_PROPS,
          },
        },
        required: ["chart_type", "title", "data_tool", "data_args"],
      },
    },
  },
];

// ─── Running a tool ──────────────────────────────────────────────────────

export type ToolResult = {
  /** JSON string sent back to the LLM. */
  content: string;
  /** Set only by show_chart — the UI renders it. */
  chart?: ChartSpec;
  /** Set only by what_if_spending — opens the what-if view. */
  whatIf?: WhatIf;
};

/** Max rows sent to the LLM. WHY: e.g. 2 years of daily balances = 730 rows of tokens. */
const MAX_ROWS_FOR_LLM = 60;

/** Tools whose rows are all money going out (spending), shown red in the chat. */
const SPENDING_TOOLS = new Set([
  "spend_by_category",
  "basket_breakdown",
  "spend_over_time",
  "largest_transactions",
  "compare_periods",
  "compare_to_peers",
  "everyday_leaks",
  "recurring_payments",
  "irregular_buffer",
]);

/**
 * Green ("in") or red ("out") for one chart row — see MoneyTone in lib/types.ts.
 * WHY decided here and not by the AI: the meaning comes from which data tool made
 * the number, so the color is always right. Unset = neutral (balance, loan, %).
 */
function rowTone(tool: string, row: ChartRow, rows: ChartRow[]): MoneyTone | undefined {
  if (SPENDING_TOOLS.has(tool)) return "out";
  switch (tool) {
    case "income_summary": // Income · Spending · Kept
      return row.label === "Spending" || row.value < 0 ? "out" : "in";
    case "safe_to_spend": // costs before payday are negative; the rest is money you have
      return row.value < 0 ? "out" : "in";
    case "what_if": {
      // "Now" is today's spending; "After −20 %" is the better choice if it's lower.
      const now = rows[0]?.value ?? 0;
      return row === rows[0] || row.value > now ? "out" : "in";
    }
    default:
      return undefined;
  }
}

function forLlm(full: ToolOutput): string {
  // WHY drop chartList / whatIf: they're for the screen; the LLM already gets the same data.
  // basketTree is the same data as `baskets`, kept for the screen only.
  // `view` is the "leaks" chart's screen data (every small purchase etc.).
  const {
    chartList: _unused,
    basketTree: _sameAsBaskets,
    view: _screenOnly,
    whatIf: _whatIf,
    ...out
  } = full;
  void _unused;
  void _sameAsBaskets;
  void _screenOnly;
  void _whatIf;
  // WHY rename value/value2 to the series names ("You" / "Typical age 26-35"):
  // with bare value/value2 the model mixed up which number was whose.
  const names = out.seriesNames;
  const rows = names
    ? out.rows?.map(({ value, value2, ...rest }) => ({ ...rest, [names[0]]: value, [names[1]]: value2 }))
    : out.rows;
  if (rows) out.rows = rows as ChartRow[];
  if (!rows || rows.length <= MAX_ROWS_FOR_LLM) return JSON.stringify(out);
  const step = Math.ceil(rows.length / MAX_ROWS_FOR_LLM);
  return JSON.stringify({
    ...out,
    rows: rows.filter((_, i) => i % step === 0),
    note: `rows thinned to every ${step}th of ${rows.length} for brevity`,
  });
}

export function runTool(name: string, args: Args): ToolResult {
  const tool = BY_NAME.get(name);
  if (tool) {
    const out = tool.run(args);
    return { content: forLlm(out), ...(out.whatIf ? { whatIf: out.whatIf } : {}) };
  }

  if (name === "show_chart") {
    const dataTool = BY_NAME.get(String(args.data_tool));
    if (!dataTool?.chartable) {
      return { content: JSON.stringify({ error: `Can't chart data_tool "${args.data_tool}"` }) };
    }
    // WHY parse strings: some models send nested objects as a JSON string.
    let dataArgs: unknown = args.data_args;
    if (typeof dataArgs === "string") {
      try {
        dataArgs = JSON.parse(dataArgs);
      } catch {
        dataArgs = {};
      }
    }
    if (typeof dataArgs !== "object" || dataArgs === null) dataArgs = {};
    const type = (CHART_TYPES as readonly string[]).includes(String(args.chart_type))
      ? (args.chart_type as ChartType)
      : "bar";
    // WHY: a heatmap needs one row per day, whatever tool the AI picked.
    // Default to the whole history so the user can browse every month.
    // WHY: "cumulative" only makes sense with month_progress's running totals.
    const out =
      type === "heatmap"
        ? BY_NAME.get("spend_over_time")!.run({
            period: "all",
            ...(dataArgs as Args),
            group_by: "day",
          })
        : type === "cumulative"
          ? BY_NAME.get("month_progress")!.run(dataArgs as Args)
          : type === "baskets"
            ? BY_NAME.get("basket_details")!.run(dataArgs as Args)
            : type === "leaks"
              ? BY_NAME.get("everyday_leaks")!.run(dataArgs as Args)
              : dataTool.run(dataArgs as Args);
    // WHY only here (not in the tool output): tone is for the screen; the LLM doesn't need it.
    const rawRows = out.rows ?? [];
    const toneTool = type === "heatmap" ? "spend_over_time" : dataTool.name;
    const rows = rawRows.map((r) => {
      const tone = r.tone ?? rowTone(toneTool, r, rawRows);
      return tone ? { ...r, tone } : r;
    });
    const chart: ChartSpec = {
      type,
      // WHY fixed for "leaks": the team picked this title (shown in italics).
      title:
        type === "leaks" ? "Where my money slips away 💸" : (optString(args.title) ?? "Your spending"),
      unit: out.unit ?? "€",
      rows,
      ...(out.seriesNames ? { seriesNames: out.seriesNames } : {}),
      ...(out.facts ? { facts: out.facts } : {}),
      ...(out.chartList ? { items: out.chartList } : {}),
      ...(out.monthNav ? { monthNav: out.monthNav } : {}),
      ...(out.basketTree ? { baskets: out.basketTree } : {}),
      ...(type === "leaks" && out.view ? { leaks: out.view } : {}),
      ...(out.periodLabel ? { periodLabel: out.periodLabel } : {}),
    };
    return { content: JSON.stringify({ shown: true, rows: rows.length }), chart };
  }

  return { content: JSON.stringify({ error: `Unknown tool "${name}"` }) };
}

/** Names of all tools (for docs / the /data page). */
export function listToolNames(): { name: string; description: string; chartable: boolean }[] {
  return TOOLS.map(({ name, description, chartable }) => ({ name, description, chartable }));
}
