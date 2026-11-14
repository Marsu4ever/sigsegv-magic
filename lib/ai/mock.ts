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
import type { ChartSpec, ChatMessage, ChartType, GoalDraft, WhatIf } from "@/lib/types";
import { FORECAST_PERIOD_TEXT } from "@/lib/types";
import { allMerchantTypes, listCategories } from "@/lib/data";
import { resolveTarget } from "@/lib/insights/targets";
import { getDefaultTarget } from "@/lib/insights/whatIfForecast";
import { runTool } from "./tools";
import { splitFollowUp } from "@/lib/followUp";

/**
 * Data tools the current mock reply used. WHY: lib/ai/chat.ts offers a lesson card that fits
 * (e.g. after the leaks chart), the way the real AI does from its prompt. Reset per reply.
 */
let toolsUsed: string[] = [];

/** runTool, remembering which data tool ran (for toolsUsed). */
function run(tool: string, args: Record<string, unknown> = {}) {
  toolsUsed.push(tool);
  return runTool(tool, args);
}

/** Run a tool and return its data (what the AI would see). */
function data(tool: string, args: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return JSON.parse(run(tool, args).content) as any;
}

/** Make a chart exactly the way the AI would (show_chart). */
function chart(
  type: ChartType,
  title: string,
  tool: string,
  args: Record<string, unknown> = {},
): ChartSpec | undefined {
  toolsUsed.push(tool);
  return runTool("show_chart", { chart_type: type, title, data_tool: tool, data_args: args }).chart;
}

/** 1520.86 → "1 520,86 €" (Finnish style, € after the number: same as every other screen). */
const eur = (n: number) =>
  `${Number(n).toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
/** Big amounts (home loans) without cents: 285500 → "285 500 €". */
const eur0 = (n: number) => `${Math.round(n).toLocaleString("fi-FI")} €`;
/** Colored amounts in the chat (components/chat/MoneyText.tsx): green = money in, red = out. */
const plus = (n: number) => `{+${eur(n)}}`;
const minus = (n: number) => `{-${eur(n)}}`;
const has = (q: string, ...words: string[]) => words.some((w) => q.includes(w));

/**
 * Words that open the what-if view (what_if_spending).
 * WHY "save if" / "reduce" / "skip" are not here: they reach what_if below (a habit's saving
 * as bars for 1 / 3 / 6 months), so both what-if tools can be tried in mock mode.
 */
const WHAT_IF_WORDS = ["what if", "spend less", "cut", "forecast", "predict", "keep spending"];

/** The coach's sentence for a what-if result (PLAN-what-if-forecast.md §2.5). */
function whatIfText(w: WhatIf): string {
  const what = w.target.label.toLowerCase();
  const P = FORECAST_PERIOD_TEXT;
  const next = w.months === 1 ? "next month" : `in the next ${P[w.months]}`;
  if (w.emptyReason === "short_history") {
    return "You have less than a month of spending history, not enough data yet to make a prediction.";
  }
  if (w.emptyReason === "no_spending") {
    // WHY no "switch to 3 months": every period uses the same 12-month average (DECISIONS.md #25).
    return `I couldn't find any spending on ${what} in the last 12 months, so there's not enough data yet to predict it.`;
  }
  // WHY every option: the user can then compare 5 / 10 / 20 % without tapping each circle.
  const lines = w.cutOptions.map((o) => `• ${o.cutPct}% less → save about ${plus(o.savingEur)}`);
  const save = `If you spent less, you'd save:\n${lines.join("\n")}`;
  const a = w.average;
  if (!a) return `You'd spend about ${minus(w.noChangeEur)} on ${what} ${next}. ${save}`;
  // WHY name the average: the estimate is the user's typical month, not last month (DECISIONS.md #34).
  // Short history (incl. status "fallback") → "your 2 months of history" says it all.
  // WHY floor: 5.9 months must not read as "6 months" next to "not enough for 6 months".
  // Same wording as averageBasisText() in components/charts/format.ts (lib must not import components).
  const n = Math.max(1, Math.floor(a.months));
  const basis = a.months >= 12 ? "the last 12 months" : `your ${n} month${n === 1 ? "" : "s"} of history`;
  const estimate =
    w.months === 1 ? "so that's the estimate for next month" : `so about ${minus(w.noChangeEur)} ${next}`;
  // WHY: with nothing spent in the shown period, the user must know where the number comes from.
  const shown = w.basedOnMonths === 1 ? "last month" : `in the last ${P[w.basedOnMonths ?? w.months]}`;
  const none = w.pastEur === 0 ? `You didn't spend on ${what} ${shown}. ` : "";
  return `${none}In a typical month you spend about ${minus(a.perMonthEur)} on ${what} (average of ${basis}), ${estimate}. ${save}`;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/**
 * "Save 1000 for a trip to Lisbon by June" → plan_goal arguments, or null when there's no amount.
 * WHY only in the mock: the real AI reads any wording; this covers the demo sentence.
 */
function parseGoal(text: string, today: string): { name: string; amount_eur: number; by_date: string } | null {
  const q = text.toLowerCase();
  const num = q.match(/(\d[\d\s]*(?:[.,]\d+)?)\s*(k\b)?/);
  if (!num) return null;
  let amount = Number(num[1].replace(/\s/g, "").replace(",", "."));
  if (num[2]) amount *= 1000;
  const [y, m] = today.split("-").map(Number);
  let by = q.match(/\b(\d{4}-\d{2}(?:-\d{2})?)\b/)?.[1];
  const month = MONTHS.findIndex((name) => q.includes(name));
  if (!by && month >= 0) {
    const year = month + 1 > m ? y : y + 1; // the next such month after today
    by = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
  }
  if (!by) by = new Date(Date.UTC(y, m - 1 + 7, 0)).toISOString().slice(0, 10); // ~6 months
  const name =
    text
      .match(/\bfor (?:a |an |the |my )?(.+?)(?= by\b| in\b|[.?!]|$)/i)?.[1]
      // WHY only money amounts: "iphone 13" must keep its 13.
      ?.replace(/\d[\d\s]*(?:[.,]\d+)?\s*(?:k\b|€|eur\w*|e\b)/gi, "")
      .trim() ?? "";
  return { name: name ? name[0].toUpperCase() + name.slice(1) : "My goal", amount_eur: amount, by_date: by };
}

/**
 * The reply under a "Save goal" card, written by code from the draft (lib/goals numbers).
 * Used by the mock and by chat.ts when the real model leaves the text empty.
 */
export function goalDraftText(d: GoalDraft): string {
  const kept =
    d.typicalKeptPerWeekEur !== null && d.typicalKeptPerWeekEur > 0
      ? ` You usually keep about ${plus(d.typicalKeptPerWeekEur)} a week${d.stretch ? ", so this is a stretch" : ""}.`
      : "";
  return `That's about ${plus(d.weeklyNeededEur)} a week for ${d.weeksLeft} weeks.${kept} Save it below and I'll suggest one small mission a week.`;
}

/** Short "yes"-style answers, English and Finnish. */
const YES = /^(yes|yeah|yep|yup|sure|ok|okay|please|go ahead|kyllä|joo|juu|näytä)\b/i;

/** Questions the mock understands, offered one at a time as the [[button]] (lib/followUp.ts). */
const MOCK_OFFERS = [
  "Where does my money slip away?",
  "What if I spend less on restaurants?",
  "What's safe to spend this week?",
  "How am I doing this month?",
  "Show my spending calendar",
];

/**
 * Like the real AI (prompt.ts, HOW TO ANSWER): a "yes" does what the last reply offered,
 * and every reply ends with one offer the user can tap.
 */
/** mockReply + the data tools it used (see toolsUsed). */
export function mockReplyWithTools(history: ChatMessage[]): { reply: ChatMessage; tools: string[] } {
  toolsUsed = [];
  const reply = mockReply(history);
  return { reply, tools: [...toolsUsed] };
}

export function mockReply(history: ChatMessage[]): ChatMessage {
  let asked = history;
  if (YES.test((history.at(-1)?.text ?? "").trim())) {
    const prev = history.findLast((m) => m.role === "assistant");
    const offer = prev ? splitFollowUp(prev.text).followUp : null;
    if (offer) asked = [...history.slice(0, -1), { role: "user", text: offer }];
  }
  const answer = mockAnswer(asked);
  if (splitFollowUp(answer.text).followUp) return answer;
  const done = new Set(asked.filter((m) => m.role === "user").map((m) => m.text.toLowerCase()));
  const next = MOCK_OFFERS.find((o) => !done.has(o.toLowerCase()));
  return next ? { ...answer, text: `${answer.text}\n[[${next}]]` } : answer;
}

function mockAnswer(history: ChatMessage[]): ChatMessage {
  const q = (history.at(-1)?.text ?? "").toLowerCase();
  const replyText = (text: string): ChatMessage => ({ role: "assistant", text: `[mock AI] ${text}`, charts: [] });
  // Saving goal (lib/goals/). WHY before "help me save": "help me save for something" is a goal.
  if (has(q, "my goal", "my mission", "goal going", "mission going")) {
    const st = data("goal_status");
    if (!st.hasGoal) return replyText("You don't have a saving goal yet. What are you saving for, how much and by when?");
    const g = st.goal;
    const m = st.mission;
    const mission = m
      ? ` This week: ${m.title}, ${eur0(m.leftEur)} left with ${m.daysLeft} days to go.`
      : " Pick this week's mission on the This week page (tap the goal on Home).";
    return replyText(`${g.name}: ${plus(g.savedEur)} of ${eur0(g.targetEur)} saved, ${plus(g.weeklyNeededEur)} a week gets you there.${mission}`);
  }
  // WHY the follow-up check: after "What are you saving for, how much?" the user answers
  // "300 e for iphone 13" without the word "save" (an empty bubble in testing).
  const prevAsked = history.findLast((m, i) => m.role === "assistant" && i < history.length - 1)?.text ?? "";
  // Only an answer (a number, not a new question) to a reply that asked about a goal.
  const goalAnswer =
    /\b(sav(e|ing) for|goal)\b[^?]*\?/i.test(prevAsked) && /\d/.test(q) && !q.includes("?");
  // WHY a regex: "save 1000 for a trip" has words between "save" and "for".
  if (goalAnswer || /\b(save|saving)\b.*\bfor\b/.test(q) || has(q, "savings goal", "saving goal", "set a goal")) {
    const today = data("goal_status").missionWeek.today as string;
    const args = parseGoal(history.at(-1)?.text ?? "", today);
    if (!args) {
      return replyText("Nice! What are you saving for, how much, and by when? For example: 1000 € for a trip by June.");
    }
    const result = runTool("plan_goal", args);
    const d = JSON.parse(result.content) as GoalDraft;
    if (d.error) return replyText(d.error);
    return {
      role: "assistant",
      text: `[mock AI] ${goalDraftText(d)}`,
      charts: [],
      goalDraft: result.goalDraft,
    };
  }
  // Proactive insights (lib/insights/proactive.ts): saving help and "what should I know".
  if (has(q, "save more", "how can i save", "how could i save", "help me save", "ways to save")) {
    const all = data("proactive_insights").insights as { kind: string; action: string; total?: { value: number } }[];
    const help = all.find((i) => i.kind === "save_help");
    const year = help?.total ? ` That adds up to {+${eur0(help.total.value)}} a year.` : "";
    if (help) return replyText(`${help.action}${year}`);
  }
  if (has(q, "should i know", "should know", "anything new", "alerts", "how am i doing overall")) {
    const all = data("proactive_insights").insights as { title: string }[];
    return replyText(all.length ? `Here's what I noticed: ${all.map((i) => i.title).join("; ")}.` : "Nothing unusual right now.");
  }
  const reply = (text: string, ...charts: (ChartSpec | undefined)[]): ChatMessage => ({
    role: "assistant",
    text: `[mock AI] ${text}`,
    charts: charts.filter((c): c is ChartSpec => !!c),
  });
  // WHY first: otherwise "cut taxis by 20%" would be caught by the category branch below.
  if (has(q, ...WHAT_IF_WORDS)) {
    // WHY these regexes: "cut by 30%" must set the % and must NOT select 3 months.
    const pct = q.match(/(\d{1,2})\s*%/)?.[1];
    const months = /\b(6|six)\s*months?\b|half a year/.test(q)
      ? 6
      : /\b(3|three)\s*months?\b|quarter/.test(q)
        ? 3
        : undefined; // undefined → the tool's default, Month
    // Unclear X → the customer's biggest everyday group (same as the chip).
    const target = (resolveTarget(q) ?? getDefaultTarget()).label;
    const w = run("what_if_spending", { category: target, months, cut_pct: pct }).whatIf;
    if (w) return { ...reply(whatIfText(w)), whatIf: w };
  }

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
      `So far this month you've spent ${minus(m.spentSoFarEur)}, ${diff >= 0 ? minus(diff) : plus(-diff)} ${diff >= 0 ? "more" : "less"} ` +
        `than by the same day last month. At this pace the month ends around ${minus(m.projectedMonthTotalEur)} ` +
        `(last month: ${minus(m.lastMonthTotalEur)}).`,
      chart("cumulative", "This month so far", "month_progress"),
    );
  }

  if (has(q, "heatmap", "calendar", "heat map", "which days", "activity")) {
    return reply(
      "Here's your spending calendar. Darker days = more spending. Tap it to switch months and see what you bought on any day.",
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
        `Small purchases under ${p.smallPurchasesLast90Days.maxEur} € add up to ${minus(p.smallPurchasesLast90Days.perMonthEur)} a month.`,
      chart("pie", "Your spending by type (%)", "spender_profile"),
    );
  }

  if (has(q, "safe to spend", "safe", "payday")) {
    const s = data("safe_to_spend", { days: 7 });
    if (s.note) return reply(s.note);
    return reply(
      `About ${plus(s.safeForRequestedDaysEur)} is safe to spend in the next ${s.coveredDays} days.` +
        (s.nextPayday ? ` Next payday ≈ ${s.nextPayday}.` : " No regular payday found."),
      chart("table", "Safe to spend", "safe_to_spend", { days: 7 }),
    );
  }

  if (has(q, "what if", "save if", "cut", "reduce", "skip")) {
    const pct = Number(q.match(/(\d+)\s*%/)?.[1] ?? 20);
    const args = {
      change_percent: -pct,
      category: category ?? "restaurants",
      period: "last_90_days",
    };
    // WHY runTool, not chart(): what_if draws its own bar chart (as now vs after, 1 / 3 / 6 months).
    const r = run("what_if", args);
    const w = JSON.parse(r.content);
    const six = w.periods.at(-1);
    return reply(
      `Cutting ${w.what} by ${pct}% would save about ${plus(w.savingPerMonthEur)} a month, ` +
        `${plus(six.savingEur)} over 6 months.`,
      r.chart,
    );
  }

  if (has(q, "slip", "leak", "small purchase", "coffee", "where does my money")) {
    const l = data("everyday_leaks", { period: "last_90_days" });
    return reply(
      `Small purchases (≤ ${l.smallPurchases.maxEur} €) happen ${l.smallPurchases.timesPerMonth}× a month and add up to ` +
        `${minus(l.smallPurchases.perMonthEur)} a month, ${minus(l.smallPurchases.perYearEur)} a year.`,
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
      `Surprise costs average ${minus(b.averagePerMonthEur)} a month; the worst month was ${b.worstMonth?.month} ` +
        `(${minus(b.worstMonth?.eur ?? 0)}). A buffer of about ${b.suggestion.emergencyBufferEur} € would cover that.`,
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
      `Last month you earned ${plus(i.incomeEur)}, spent ${minus(i.spendingEur)} and kept ${i.keptEur >= 0 ? plus(i.keptEur) : minus(-i.keptEur)}.`,
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

  if (q.includes("basket") || q.includes("spending type")) {
    // WHY 90 days: one month often has only 2–3 categories; 3 months shows the real mix.
    const c = chart("baskets", "Your spending types (last 90 days)", "basket_details", {
      period: "last_90_days",
    });
    const rows = c?.rows ?? [];
    const total = rows.reduce((s, r) => s + r.value, 0);
    return reply(
      `In the last 90 days you've spent ${minus(total)}: ` +
        rows.map((r) => `${minus(r.value)} ${r.label.toLowerCase()}`).join(", ") +
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
    return reply(`Last month you spent ${minus(total)} on ${category}.`, c);
  }

  if (q.includes("week")) {
    // WHY last 7 days: the dataset ends mid-week (same rule as the Week tab).
    const c = chart("bar", "Last 7 days by category", "spend_by_category", {
      period: "last_7_days",
    });
    const total = (c?.rows ?? []).reduce((s, r) => s + r.value, 0);
    return reply(`In the last 7 days you've spent ${minus(total)}.`, c);
  }

  // WHY short: the coach should never ramble, not even the mock. Words the mock knows (for
  // testing): what kind of spender am I, where does my money slip away, what if I spend 20%
  // less on restaurants, safe to spend, my bills, surprise costs, compared to people my age,
  // my income, my balance, biggest purchases, compare months, my baskets, spending trend,
  // spending calendar, my home loan, or a category like "taxi".
  return reply("I'm the mock AI, so I only know a few questions. Try a suggested one.");
}
