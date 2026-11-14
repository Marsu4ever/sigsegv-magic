/**
 * MOCK AI — fake replies chosen by keywords. No LLM, no API key needed.
 *
 * WHY: lets the team build and test the chat (text + chart cards) without a
 * model. It still uses the REAL tools and data, so it also tests every tool
 * and the data → chart pipeline end to end.
 *
 * Used automatically when LLM_BASE_URL / LLM_MODEL are not set, or AI_MODE=mock.
 * The real AI understands any wording; the mock only reacts to the keywords below.
 */
import type { ChartSpec, ChatMessage, ChartType } from "@/lib/types";
import { allMerchantTypes, listCategories } from "@/lib/data";
import { runTool } from "./tools";

/** Run a tool and return its data (what the AI would see). */
function data(tool: string, args: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return JSON.parse(runTool(tool, args).content) as any;
}

/** Make a chart exactly the way the AI would (show_chart). */
function chart(
  type: ChartType,
  title: string,
  tool: string,
  args: Record<string, unknown> = {},
): ChartSpec | undefined {
  return runTool("show_chart", { chart_type: type, title, data_tool: tool, data_args: args }).chart;
}

const eur = (n: number) => `€${Number(n).toFixed(2)}`;
/** Big amounts (home loans) without cents: 285500 → "€285,500". */
const eur0 = (n: number) => `€${Math.round(n).toLocaleString("en")}`;
const has = (q: string, ...words: string[]) => words.some((w) => q.includes(w));

export function mockReply(history: ChatMessage[]): ChatMessage {
  const q = (history.at(-1)?.text ?? "").toLowerCase();
  const reply = (text: string, ...charts: (ChartSpec | undefined)[]): ChatMessage => ({
    role: "assistant",
    text: `[mock AI] ${text}`,
    charts: charts.filter((c): c is ChartSpec => !!c),
  });
  // Category or merchant type mentioned? ("taxis" matches "Taxi" via its stem)
  const category = [...listCategories(), ...allMerchantTypes()].find((c) =>
    q.includes(c.toLowerCase()),
  );

  // WHY first: "home loan" would otherwise match the "Home & Tech" category or another keyword.
  if (has(q, "mortgage", "home loan", "loan", "laina")) {
    const m = data("mortgage_status");
    if (!m.hasMortgage) {
      return reply("You don't have a home loan application. Want to see how much you could save each month?");
    }
    const reason = String(m.rejectionReason ?? "not recorded").replace(/_/g, " ");
    return reply(
      m.decision === "approved"
        ? `Your home loan of ${eur0(m.loanEur)} was approved on ${m.decidedOn}. ` +
            `You're paying ${eur0(m.equityEur)} of the ${eur0(m.property.priceEur)} price with your own money.`
        : `Your home loan application was rejected on ${m.decidedOn}. The bank's reason: ${reason}. ` +
            `You applied for ${eur0(m.loanEur)} with ${eur0(m.equityEur)} of your own money.`,
      chart("pie", "How the home is paid for", "mortgage_financing"),
    );
  }

  if (has(q, "this month", "so far", "on track", "projection", "cumulative", "month progress")) {
    const m = data("month_progress");
    const diff = m.differenceVsLastMonthSoFarEur;
    return reply(
      `So far this month you've spent ${eur(m.spentSoFarEur)} — ${eur(Math.abs(diff))} ${diff >= 0 ? "more" : "less"} ` +
        `than by the same day last month. At this pace the month ends around ${eur(m.projectedMonthTotalEur)} ` +
        `(last month: ${eur(m.lastMonthTotalEur)}).`,
      chart("cumulative", "This month so far", "month_progress"),
    );
  }

  if (has(q, "heatmap", "calendar", "heat map", "which days", "activity")) {
    return reply(
      "Here's your spending calendar — darker days = more spending. Tap it to switch months and see what you bought on any day.",
      chart("heatmap", category ? `${category} calendar` : "Spending calendar", "spend_over_time", {
        period: "all",
        ...(category ? { category } : {}),
      }),
    );
  }

  if (has(q, "kind of spender", "spender type", "what kind")) {
    const p = data("spender_profile");
    return reply(
      `You're a "${p.type}" (${p.typeRule}). You keep ${Math.round(p.keptShare * 100)}% of your income. ` +
        `Small purchases under €${p.smallPurchasesLast90Days.maxEur} add up to ${eur(p.smallPurchasesLast90Days.perMonthEur)} a month.`,
      chart("pie", "Your spending by basket (%)", "spender_profile"),
    );
  }

  if (has(q, "safe to spend", "safe")) {
    const s = data("safe_to_spend", { days: 7 });
    return reply(
      `About ${eur(s.safeForRequestedDaysEur)} is safe to spend in the next 7 days. Next payday ≈ ${s.nextPayday}.`,
      chart("table", "Safe to spend", "safe_to_spend", { days: 7 }),
    );
  }

  if (has(q, "what if", "save if", "cut", "reduce")) {
    const pct = Number(q.match(/(\d+)\s*%/)?.[1] ?? 20);
    const args = {
      change_percent: -pct,
      category: category ?? "restaurants",
      period: "last_90_days",
    };
    const w = data("what_if", args);
    return reply(
      `Cutting ${w.what} by ${pct}% would save about ${eur(w.savingPerMonthEur)} a month — ${eur(w.savingPerYearEur)} a year.`,
      chart("bar", `${w.what}: now vs after −${pct}%`, "what_if", args),
    );
  }

  if (has(q, "slip", "leak", "small purchase", "coffee", "where does my money")) {
    const l = data("everyday_leaks", { period: "last_90_days" });
    return reply(
      `Small purchases (≤ €${l.smallPurchases.maxEur}) happen ${l.smallPurchases.timesPerMonth}× a month and add up to ` +
        `${eur(l.smallPurchases.perMonthEur)} a month — ${eur(l.smallPurchases.perYearEur)} a year.`,
      chart("leaks", "Where my money slips away 💸", "everyday_leaks", { period: "last_90_days" }),
    );
  }

  if (has(q, "bill", "subscription", "recurring", "fixed")) {
    const r = data("recurring_payments");
    return reply(
      `I found ${r.items.length} regular payments in the last 12 months.`,
      chart("table", "Regular payments (per month)", "recurring_payments"),
    );
  }

  if (has(q, "surprise", "irregular", "buffer", "emergency")) {
    const b = data("irregular_buffer");
    return reply(
      `Surprise costs average ${eur(b.averagePerMonthEur)} a month; the worst month was ${b.worstMonth?.month} ` +
        `(${eur(b.worstMonth?.eur ?? 0)}). A buffer of about €${b.suggestion.emergencyBufferEur} would cover that.`,
      chart("bar", "Surprise costs per month", "irregular_buffer"),
    );
  }

  if (has(q, "compared", "others", "peers", "people my age", "average person")) {
    const c = data("compare_to_peers");
    return reply(
      `Here's you vs the typical person aged ${c.ageGroup} (${c.peers} people), per month.`,
      chart("bar", "You vs your age group (€/month)", "compare_to_peers"),
    );
  }

  if (has(q, "income", "earn", "keep", "salary")) {
    const i = data("income_summary", { period: "last_month" });
    return reply(
      `Last month you earned ${eur(i.incomeEur)}, spent ${eur(i.spendingEur)} and kept ${eur(i.keptEur)}.`,
      chart("bar", "Last month: income vs spending", "income_summary", { period: "last_month" }),
    );
  }

  if (has(q, "balance")) {
    const b = data("balance_over_time", { period: "last_90_days" });
    return reply(
      `Over the last 90 days your balance was lowest on ${b.lowest?.date} (${eur(b.lowest?.balanceEur ?? 0)}).`,
      chart("line", "Balance, last 90 days", "balance_over_time", { period: "last_90_days" }),
    );
  }

  if (has(q, "biggest", "largest", "most expensive")) {
    return reply(
      "Your biggest purchases in the last 90 days:",
      chart("table", "Biggest purchases, last 90 days", "largest_transactions", {
        period: "last_90_days",
      }),
    );
  }

  if (has(q, "compare", "vs", "versus")) {
    return reply(
      "Last month vs this month, per category:",
      chart("bar", "Last month vs this month", "compare_periods", {
        period: "last_month",
        period_b: "this_month",
      }),
    );
  }

  if (q.includes("basket")) {
    // WHY 90 days: one month often has only 2–3 categories; 3 months shows the real mix.
    const c = chart("baskets", "Your 3 baskets (last 90 days)", "basket_details", {
      period: "last_90_days",
    });
    const rows = c?.rows ?? [];
    const total = rows.reduce((s, r) => s + r.value, 0);
    return reply(
      `In the last 90 days you've spent ${eur(total)}: ` +
        rows.map((r) => `${eur(r.value)} ${r.label.toLowerCase()}`).join(", ") +
        ". Tap a category to see what's inside it.",
      c,
    );
  }

  if (has(q, "trend", "over time")) {
    return reply(
      "Here's your weekly spending over the last 90 days.",
      chart("line", "Weekly spending, last 90 days", "spend_over_time", {
        period: "last_90_days",
        group_by: "week",
      }),
    );
  }

  if (category) {
    const c = chart("table", `${category}, last month`, "spend_by_category", {
      period: "last_month",
      category,
    });
    const total = (c?.rows ?? []).reduce((s, r) => s + r.value, 0);
    return reply(`Last month you spent ${eur(total)} on ${category}.`, c);
  }

  if (q.includes("week")) {
    // WHY last 7 days: the dataset ends mid-week (same rule as the Week tab).
    const c = chart("bar", "Last 7 days by category", "spend_by_category", {
      period: "last_7_days",
    });
    const total = (c?.rows ?? []).reduce((s, r) => s + r.value, 0);
    return reply(`In the last 7 days you've spent ${eur(total)}.`, c);
  }

  return reply(
    'I\'m a placeholder until the real AI is connected. Try: "what kind of spender am I", ' +
      '"where does my money slip away", "how much could I save if I cut restaurants by 20%", ' +
      '"what\'s safe to spend", "my bills", "surprise costs", "compared to people my age", ' +
      '"my income", "my balance", "biggest purchases", "compare months", "my baskets", ' +
      '"spending trend", "spending calendar", "my home loan", or a category like "taxi".',
  );
}
