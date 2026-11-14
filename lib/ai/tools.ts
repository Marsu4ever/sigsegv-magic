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
 * - saving goal: goal_status (read) and plan_goal (a draft the USER saves with a button —
 *   the AI never creates a goal itself), from lib/goals/ (DECISIONS.md #60).
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
  GoalDraft,
  MoneyTone,
  WhatIf,
} from "@/lib/types";
import type { ToolDefinition } from "./llm";
import { BASKETS, BASKET_LABELS } from "@/lib/types";
import {
  PERIODS,
  addMonths,
  basketBreakdown,
  listTransactions,
  periodToRange,
  spendByCategory,
  spendOverTime,
  type Period,
} from "@/lib/data";
import {
  MONEY_MEASURES,
  balanceOverTime,
  comparePeriods,
  incomeSummary,
  largestTransactions,
  moneyOverTime,
  summarize,
  transactionRows,
  type MoneyMeasure,
} from "@/lib/data/money";
import { startOfMonth } from "@/lib/data/dates";
import { compareToPeers, getBenchmarks } from "@/lib/insights/benchmarks";
import { everydayLeaks, habitSkipOne } from "@/lib/insights/leaks";
import { irregularBuffer } from "@/lib/insights/irregular";
import { monthProgress } from "@/lib/insights/monthProgress";
import { basketTree } from "@/lib/insights/basketTree";
import { recurringPayments } from "@/lib/insights/recurring";
import { safeToSpend } from "@/lib/insights/safeToSpend";
import { spenderProfile } from "@/lib/insights/spenderProfile";
import { whatIf } from "@/lib/insights/whatIf";
import { getMortgageSummary } from "@/lib/data/mortgage";
import { proactiveInsights } from "@/lib/insights/proactive";
import { getWhatIf, parseCutPct, parseMonths } from "@/lib/insights/whatIfForecast";
import { availableNames, resolveTarget, targetFromNames } from "@/lib/insights/targets";
import { planGoal, simToday } from "@/lib/goals/goal";
import { getGoalState } from "@/lib/goals/state";

const getGoalToday = () => simToday(getGoalState());
import { goalView } from "@/lib/goals/view";

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
  /** "Save goal" card under the reply (ChatMessage.goalDraft). Not sent to the LLM. */
  goalDraft?: GoalDraft;
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
  months: {
    type: "number",
    description:
      "Optional: the last N calendar months up to today in the data, e.g. 7 for 'last 7 months' " +
      "(includes the current month). Overrides period. Use this instead of doing date math.",
  },
  from: { type: "string", description: "Optional exact start date YYYY-MM-DD. Overrides period/months." },
  to: { type: "string", description: "Optional exact end date YYYY-MM-DD. Overrides period/months." },
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
  // "Last N months" — only for the main period (not compare_periods' second one).
  const months = Number(args.months);
  if (p === "period" && Number.isFinite(months) && months >= 1) {
    const today = periodToRange("this_month").to;
    range.from = startOfMonth(addMonths(today, -(Math.min(Math.round(months), 36) - 1)));
    range.to = today;
  }
  if (typeof args[f] === "string" && DATE_RE.test(args[f] as string))
    range.from = args[f] as string;
  if (typeof args[t] === "string" && DATE_RE.test(args[t] as string)) range.to = args[t] as string;
  return range;
}

/**
 * A goal date the model put in the past → the same day a year later.
 * WHY: asked "by June" on 30 Sep 2026, Qwen sent 2026-06-30; the user means next June.
 */
function nextIfPast(v: unknown): unknown {
  if (typeof v !== "string" || !DATE_RE.test(v) && !/^\d{4}-\d{2}$/.test(v)) return v;
  const today = getGoalToday();
  if (v.slice(0, 7) >= today.slice(0, 7)) return v;
  const [y, ...rest] = v.split("-");
  const next = [String(Number(y) + 1), ...rest].join("-");
  return next.slice(0, 7) >= today.slice(0, 7) ? next : v;
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
      const rows = spendOverTime(range, groupBy, optString(a.category));
      // WHY a summary: so the model never adds up or averages rows itself.
      return { range, rows, summary: summarize(rows, "spendingEur", true) };
    },
  },
  {
    name: "money_over_time",
    description:
      "THE general tool for anything over time: income, spending, kept (income minus spending), " +
      "income_vs_spending (both side by side) or balance, per day, week or month, for any range " +
      "(months: N for 'last N months', or period/from/to). Optional category or basket filter " +
      "(applies to spending). Covers all the data history (about 2 years). Returns one row per " +
      "day/week/month plus a summary (totals, average, highest, lowest) — use those numbers, " +
      "never add up rows yourself. Draw it with show_chart (bar, or line for balance).",
    properties: {
      ...periodProps,
      measure: { type: "string", enum: [...MONEY_MEASURES] },
      group_by: { type: "string", enum: ["day", "week", "month"], description: "Default month." },
      category: { type: "string", description: "Spending only, e.g. 'restaurants'." },
      basket: { type: "string", enum: [...BASKETS], description: "Spending only." },
    },
    required: ["measure"],
    chartable: true,
    run: (a) => {
      const range = rangeFrom(a, "last_90_days");
      const measure = (MONEY_MEASURES as readonly string[]).includes(String(a.measure))
        ? (a.measure as MoneyMeasure)
        : "income_vs_spending";
      const g = a.group_by;
      const groupBy = g === "day" || g === "week" ? g : "month";
      return moneyOverTime(range, measure, groupBy, {
        category: optString(a.category),
        basket: optBasket(a.basket),
      });
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
    // The what-if VIEW (chart + Month / 3 / 6 months toggle). what_if below = a habit's saving
    // as bars (1 / 3 / 6 months), e.g. after the leaks chart (DECISIONS.md #44).
    name: "what_if_spending",
    description:
      "Opens the interactive what-if view for 'what if I spent less on X?', 'what will I spend on X next " +
      "month / in 3 or 6 months?' (a forecast). For a saving on a habit ('skip one cafe visit a week', 'how much " +
      "would I save if I cut X by N%', follow-ups to the everyday_leaks chart) use what_if instead. Predicts the next 1, 3 or 6 months as the user's average month " +
      "on X (last 12 months, or all history if shorter; see average) × months, unchanged vs with a cut, and opens " +
      "a what-if chart of the last 1, 3 or 6 months for the user. lastYear = same months a year ago (info only). category: e.g. 'restaurants', " +
      "'eating out' (= restaurants + cafes + takeaway), 'groceries', 'taxi'. only: optional list of exact " +
      "categories or merchant types to narrow it, e.g. ['Cafes'] or ['Fast food'] (the result's breakdown shows " +
      "what is inside). cut_pct: the % less the view opens on, a whole number 1–100, default 5. The chart has " +
      "buttons for 5, 10 and 20; any other % the user names " +
      "gets its own button. The result's cutOptions has the saving for every button. months: 1, 3 or 6, " +
      "default 1 — set it when the user or your own question names a period. monthsWithData in the result " +
      "says which periods have data.",
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
      "Saving from a habit change: 'skip one cafe visit a week', 'how much would I save if I cut taxis by 20%', " +
      "'how does that add up over 3 or 6 months?' — the natural next step after the everyday_leaks chart. Uses the " +
      "average month over the period (default last 90 days, the same as everyday_leaks) for a category / merchant " +
      "type (e.g. 'Cafes') or a basket. change_percent: -20 = spend 20% less. skip_one: true = the habit's " +
      "'skip one' nudge from everyday_leaks (Skip 1 a week / a month / every 2nd), no % needed; category must " +
      "then be the habit's name from everyday_leaks. periods = as now / after / saving for 1, 3 and 6 months. " +
      "It shows the user its own bar chart (as now vs after, for a month, 3 and 6 months) — " +
      "don't call show_chart for it.",
    properties: {
      ...periodProps,
      change_percent: { type: "number", description: "e.g. -20 for a 20% cut." },
      category: { type: "string", description: "e.g. 'restaurants', 'taxi'." },
      basket: { type: "string", enum: [...BASKETS] },
      skip_one: { type: "boolean", description: "true = the habit's 'skip one' nudge instead of a %." },
    },
    required: [],
    chartable: true,
    run: (a) => {
      const range = rangeFrom(a, "last_90_days");
      const category = optString(a.category);
      // WHY computed here, not passed by the AI: the "yes" usually comes a turn after the leaks
      // chart, when the AI no longer sees its numbers (it invented "14 %" for CUST01350).
      if (a.skip_one === true || a.skip_one === "true") {
        const skip = habitSkipOne(range, category ?? "");
        if (!skip) {
          return {
            error: `No "skip one" nudge for "${category}" in this period.`,
            // WHY the savings too: with names only, the model invented an amount for one of them.
            habitsWithSkipOne: everydayLeaks(range)
              .groups.filter((g) => g.skipOne)
              .map((g) => ({ name: g.name, perMonthEur: g.perMonthEur, ...g.skipOne })),
            next: "Offer one of these habits; for its saving over 1, 3 and 6 months call what_if with skip_one for it.",
          };
        }
        return {
          ...whatIf({ range, changePercent: -skip.pct, habit: skip.habit, afterLabel: skip.label }),
          // WHY: in a follow-up turn the model no longer sees everyday_leaks and offered habits
          // the customer doesn't have ("coffee or public transport"). These are the real ones.
          otherHabitsWithSkipOne: everydayLeaks(range)
            .groups.filter((g) => g.skipOne && g.name !== skip.habit)
            .map((g) => `${g.name} (${g.skipOne!.label})`),
        };
      }
      return whatIf({
        range,
        changePercent: clampNumber(a.change_percent, -100, 500, -20),
        category,
        basket: optBasket(a.basket),
      });
    },
  },
  {
    name: "safe_to_spend",
    description:
      "Answers 'What is safe for me to spend this week?': balance minus fixed costs due before the next payday (fixedCosts lists them) and a surprise reserve = what's safe until payday, per day, and for the requested number of days (default 7). safeForRequestedDaysEur only covers coveredDays (the days before payday). shortfallEur > 0 means fixed costs + reserve are more than the balance. nextPayday null = no salary rhythm found (30 days assumed). All parts are returned so you can explain them.",
    properties: { days: { type: "number", description: "Number of days, default 7." } },
    chartable: true,
    run: (a) =>
      safeToSpend(clampNumber(a.days, 1, 31, 7)) ?? {
        note: "No transactions yet, so there is nothing to base a safe-to-spend amount on.",
      },
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

  {
    name: "proactive_insights",
    description:
      "What the app noticed without being asked, most important first: help to save (if the user keeps little or " +
      "overspends), spending alerts, unusual activity, recurring payments. Each has what was noticed, why, and an action.",
    properties: {},
    chartable: false,
    run: () => ({ insights: proactiveInsights() }),
  },

  // ── Saving goal (lib/goals/) ───────────────────────────────────────────
  {
    name: "goal_status",
    description:
      "The user's saving goal and weekly mission: goal name, target, how much is saved (only money the user " +
      "moved counts), weekly amount needed from now, days ahead of plan, this week's mission (limit, spent, " +
      "left, days left), mission choices if none is picked, the last week's result, level and weeks won. " +
      "hasGoal=false if they have none.",
    properties: {},
    chartable: false,
    run: () => {
      const v = goalView();
      const g = v.goal;
      const m = v.mission;
      return {
        hasGoal: !!g,
        ...(g
          ? {
              goal: {
                name: g.name,
                targetEur: g.targetEur,
                savedEur: g.savedEur,
                remainingEur: g.remainingEur,
                byDate: g.byDate,
                weeklyNeededEur: g.weeklyNeededEur,
                daysAheadOfPlan: g.daysAhead,
                reached: g.reached,
              },
            }
          : {}),
        level: v.level,
        weeksWon: v.weeksWon,
        missionWeek: v.week,
        mission: m
          ? {
              title: m.title,
              habit: m.habit,
              usualWeekEur: m.baselineEur,
              limitEur: m.capEur,
              spentEur: m.spentEur,
              leftEur: m.leftEur,
              daysLeft: m.daysLeft,
              status: m.status,
            }
          : null,
        // WHY a separate note: Qwen read the first choice as "your current mission".
        ...(m || !g
          ? {}
          : {
              missionNote: "No mission picked this week yet. The user picks one of these on the This week page (tap the goal on Home).",
              missionChoices: v.candidates.map((c) => ({ title: c.title, usualWeekEur: c.baselineEur, keepsEur: c.keepsEur })),
            }),
        lastWeek: v.result,
        whereToSeeIt: "the This week page (Home → tap the goal)",
      };
    },
  },
  {
    name: "plan_goal",
    description:
      "Use when the user wants to save for something with an amount and a date. Checks the goal and works out " +
      "the weekly amount needed, how that compares with what they usually keep per week, and a later date if it's " +
      "a stretch. The app then shows a card with a Save button: the USER saves it, you never say it is saved.",
    properties: {
      name: { type: "string", description: "Short goal name in the user's words, e.g. 'Trip to Lisbon'." },
      amount_eur: { type: "number", description: "Target amount in euros." },
      by_date: {
        type: "string",
        description: "Deadline YYYY-MM-DD (a month alone → its last day, the next one after today in the data).",
      },
      already_saved_eur: { type: "number", description: "Only if the user said they already have some set aside." },
    },
    required: ["name", "amount_eur", "by_date"],
    chartable: false,
    run: (a) => {
      // WHY aliases: Qwen sent {amount, date} instead of {amount_eur, by_date} in testing.
      const draft = planGoal(
        {
          name: a.name ?? a.goal,
          amountEur: a.amount_eur ?? a.amount,
          byDate: nextIfPast(a.by_date ?? a.date ?? a.deadline),
          startEur: a.already_saved_eur ?? a.already_saved,
        },
        getGoalState(),
      );
      // WHY saved:false spelled out: Qwen still wrote "the goal is now set" without it.
      return draft.error
        ? draft
        : { ...draft, saved: false, nextStep: "The user taps Save on the card under your reply.", goalDraft: draft };
    },
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

/**
 * Does this tool take the shared period/months range? (what_if_spending's own `months`
 * means something else, so it must not get the user's "N months" injected.)
 */
export function usesMonthsRange(name: string): boolean {
  return BY_NAME.get(name)?.properties.months === periodProps.months;
}

/** Can this tool's result be drawn with show_chart? */
export function isChartable(name: string): boolean {
  return CHARTABLE.includes(name);
}

/**
 * Chart type + title for drawing a data tool's result when the model forgot show_chart.
 * WHY plain words: the title is all the user sees about what the chart is.
 */
export function autoChartArgs(tool: string, args: Args): { chart_type: ChartType; title: string } {
  const months = Number(args.months);
  const span = Number.isFinite(months) && months >= 1 ? `, last ${Math.round(months)} months` : "";
  if (tool === "money_over_time") {
    const what: Record<string, string> = {
      income: "Income",
      spending: "Spending",
      kept: "Money kept",
      income_vs_spending: "Income vs spending",
      balance: "Balance",
    };
    const per = args.group_by === "day" ? "per day" : args.group_by === "week" ? "per week" : "per month";
    const measure = String(args.measure);
    return {
      chart_type: measure === "balance" ? "line" : "bar",
      title: `${what[measure] ?? "Income vs spending"} ${per}${span}`,
    };
  }
  if (tool === "balance_over_time") return { chart_type: "line", title: `Balance${span}` };
  if (tool === "spender_profile") return { chart_type: "pie", title: "Your spending by basket (%)" };
  if (tool === "spend_over_time") {
    const cat = typeof args.category === "string" && args.category.trim() ? args.category.trim() : "";
    const name = cat ? cat[0].toUpperCase() + cat.slice(1) : "Spending";
    return { chart_type: "bar", title: `${name} over time${span}` };
  }
  return { chart_type: "bar", title: "Your numbers" };
}

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
  /** Set by show_chart, and by what_if (draws its own chart) — the UI renders it. */
  chart?: ChartSpec;
  /** Set only by what_if_spending — opens the what-if view. */
  whatIf?: WhatIf;
  /** Set only by plan_goal — the "Save goal" card. */
  goalDraft?: GoalDraft;
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
function rowTone(tool: string, row: ChartRow): MoneyTone | undefined {
  if (SPENDING_TOOLS.has(tool)) return "out";
  switch (tool) {
    case "income_summary": // Income · Spending · Kept
      return row.label === "Spending" || row.value < 0 ? "out" : "in";
    case "safe_to_spend": // costs before payday are negative; the rest is money you have
      return row.value < 0 ? "out" : "in";
    // what_if: its rows carry tone + tone2 already (lib/insights/whatIf.ts).
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
    goalDraft: _goalDraft,
    ...out
  } = full;
  void _goalDraft;
  void _unused;
  void _sameAsBaskets;
  void _screenOnly;
  void _whatIf;
  // WHY rename value/value2 to the series names ("You" / "Typical age 26-35"):
  // with bare value/value2 the model mixed up which number was whose.
  const names = out.seriesNames;
  // WHY drop tone/tone2: colours are for the screen.
  const plain = out.rows?.map(({ tone: _t, tone2: _t2, ...r }) => (void _t, void _t2, r));
  const rows = names
    ? plain?.map(({ value, value2, ...rest }) => ({ ...rest, [names[0]]: value, [names[1]]: value2 }))
    : plain;
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
    // WHY what_if draws its own chart: a saving without the bars is the "numbers but no chart"
    // answer users got when the model forgot show_chart. Same path as show_chart, so it looks the same.
    const chart =
      name === "what_if" && !out.error && out.rows?.length
        ? runTool("show_chart", {
            chart_type: "bar",
            title: `${out.what}: as now vs ${(out.seriesNames?.[1] ?? "after").toLowerCase()}`,
            data_tool: "what_if",
            data_args: args,
          }).chart
        : undefined;
    return {
      content: forLlm(out),
      ...(out.whatIf ? { whatIf: out.whatIf } : {}),
      ...(out.goalDraft ? { goalDraft: out.goalDraft } : {}),
      ...(chart ? { chart } : {}),
    };
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
      const tone = r.tone ?? rowTone(toneTool, r);
      return tone ? { ...r, tone } : r;
    });
    const chart: ChartSpec = {
      type,
      source: { tool: dataTool.name, args: dataArgs as Args },
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
    // WHY the data too, not only {shown}: Qwen often calls show_chart without the data tool,
    // then had no numbers and invented them ("Cafes €48.20" for a customer with no cafes).
    // forLlm drops the screen-only parts and thins long row lists, as for any tool.
    return { content: forLlm({ ...out, shown: true }), chart };
  }

  return { content: JSON.stringify({ error: `Unknown tool "${name}"` }) };
}

/** Names of all tools (for docs / the /data page). */
export function listToolNames(): { name: string; description: string; chartable: boolean }[] {
  return TOOLS.map(({ name, description, chartable }) => ({ name, description, chartable }));
}
