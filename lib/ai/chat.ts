/**
 * The chat loop: user question → LLM → tools → LLM → answer. Owner: AI person.
 * SERVER ONLY. Called by app/api/chat/route.ts.
 *
 * WHY a loop: answering one question may take several tool calls
 * (e.g. this month's spending, then last month's, then a chart).
 * We cap the rounds so a confused model can't loop forever.
 *
 * DEBUGGING: every step logs a line starting with [ai] to the terminal
 * running `npm run dev`. If the chat hangs or fails, look there first.
 */
import type { ChartSpec, ChatMessage, WhatIf } from "@/lib/types";
import {
  allMerchantTypes,
  getCustomer,
  getDataToday,
  getTransactions,
  listCategories,
} from "@/lib/data";
import { getAiConfig } from "./config";
import { chatCompletion, LlmError, type LlmMessage } from "./llm";
import { getDefaultTarget } from "@/lib/insights/whatIfForecast";
import { buildSystemPrompt } from "./prompt";
import { TOOL_DEFINITIONS, autoChartArgs, isChartable, runTool, usesMonthsRange } from "./tools";
import { mockReply } from "./mock";
import { noLongDashes } from "@/lib/noDashes";

const MAX_TOOL_ROUNDS = 7;

/** The user asked to SEE something (a chart), not just for an answer. */
const WANTS_CHART = /\b(graph|chart|plot|visuali[sz]e|diagram|bar chart|line chart|pie)\b|^\s*show\b/i;
/** A euro amount in the reply, e.g. "€6,168.03", "120 €", "1 200,50 €". */
const HAS_EURO_AMOUNT = /€\s?\d|\d[\d\s.,]*\s?€|\d[\d.,]*\s?(eur|euros)\b/i;

/**
 * "last 7 months", "past 12 months", "half a year" in the question → 7 / 12 / 6.
 * WHY: the model sometimes turns "7 months" into last_7_days. The server reads the number
 * from the user's own words and puts it in the tool arguments.
 */
function monthsAsked(question: string): number | null {
  if (/\bhalf (a )?year\b|puoli vuotta/i.test(question)) return 6;
  const m = question.match(/\b(\d{1,2})\s*(months?|mo\b|kk\b|kuukau)/i);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 36 ? n : null;
}

/** Put the asked number of months into a tool's arguments, unless exact dates were given. */
function withMonths(args: Record<string, unknown>, months: number | null): Record<string, unknown> {
  if (!months || args.from || args.to || args.months === months) return args;
  const { period: _p, ...rest } = args;
  void _p;
  return { ...rest, months };
}

/**
 * One line per chart that was shown, added to the assistant's text in the history.
 * WHY: the model only sees past TEXT. Without this, "show it as a graph" or
 * "now over 12 months" has no idea what "it" was (it once drew entertainment instead of income).
 */
function chartNotes(m: ChatMessage): string {
  const notes = (m.charts ?? []).map((c) =>
    c.source
      ? `[chart shown: "${c.title}" = show_chart(${c.type}, ${c.source.tool}, ${JSON.stringify(c.source.args)})]`
      : `[chart shown: "${c.title}" (${c.type})]`,
  );
  return notes.length ? `\n${notes.join("\n")}` : "";
}
/** Max time for ONE request to the LLM. */
export const LLM_TIMEOUT_MS = 30_000;

/**
 * Turns any LLM error into one clear sentence: what failed + the likely fix.
 * Shown in the chat and in the terminal.
 */
export function explainLlmError(err: unknown, model: string): string {
  if (!(err instanceof LlmError)) {
    return `Unexpected error in the AI code: ${err instanceof Error ? err.message : String(err)}`;
  }
  const from = `(model "${model}"${err.status ? `, HTTP ${err.status}` : ""})`;
  switch (err.kind) {
    case "timeout":
      return `LLM gave no answer within ${LLM_TIMEOUT_MS / 1000}s ${from}. Try again or try another model.`;
    case "network":
      return `Could not reach the LLM: ${err.message}. Check LLM_BASE_URL and your internet.`;
    case "auth":
      return `LLM rejected the API key ${from}: ${err.message}. Check LLM_API_KEY in .env.local.`;
    case "not_found":
      return `LLM says the model or URL doesn't exist ${from}: ${err.message}. Check LLM_MODEL / LLM_BASE_URL.`;
    case "rate_limit":
      return `LLM quota / rate limit reached ${from}: ${err.message}. Free tiers have small limits — wait, or switch model or provider.`;
    case "overloaded":
      return `LLM is overloaded right now ${from}: ${err.message}. Try again in a moment or try another model.`;
    default:
      return `LLM error ${from}: ${err.message}`;
  }
}

function ms(start: number): string {
  return `${Date.now() - start}ms`;
}

/**
 * Chart safety net. WHY: real models sometimes answer in text only and forget
 * show_chart (Qwen did for "How are my 3 baskets looking?"). For the questions
 * the mock understands (baskets, calendar, month so far, slips away…) we add
 * the chart the mock would show — same keywords, same real data, same tools —
 * so the app looks the same with or without the real AI. The AI's text stays.
 */
/** Only the app's special views; a plain bar/pie from keywords could show the wrong period. */
const FALLBACK_TYPES = new Set(["baskets", "heatmap", "cumulative", "leaks"]);

function fallbackCharts(history: ChatMessage[]): ChartSpec[] {
  try {
    const found = (mockReply(history).charts ?? []).filter((c) => FALLBACK_TYPES.has(c.type));
    if (found.length > 0) {
      console.log(
        `[ai] model drew no chart — added ${found.map((c) => c.type).join(", ")} (keyword fallback)`,
      );
    }
    return found;
  } catch (err) {
    console.warn("[ai] chart fallback failed:", err);
    return [];
  }
}

export async function runChat(history: ChatMessage[]): Promise<{
  reply: ChatMessage;
  mode: "live" | "mock";
}> {
  const config = getAiConfig();
  if (config.mode === "mock") {
    console.log("[ai] mode=mock (set LLM_BASE_URL + LLM_MODEL in .env.local for a real model)");
    const reply = mockReply(history);
    return { reply: { ...reply, text: noLongDashes(reply.text) }, mode: "mock" };
  }

  // WHY log host + model but never the key: enough to spot a typo, safe to share.
  console.log(
    `[ai] mode=live model=${config.model} host=${new URL(config.baseURL).host}` +
      (config.reasoningEffort ? ` reasoning_effort=${config.reasoningEffort}` : ""),
  );

  const messages: LlmMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt({
        today: getDataToday(),
        firstDay: getTransactions()[0]?.date ?? getDataToday(),
        categories: listCategories(),
        merchantTypes: allMerchantTypes(),
        age: getCustomer().age,
        whatIfDefault: getDefaultTarget().label,
      }),
    },
    // WHY only text from history: earlier charts are already on screen;
    // re-sending their data would waste tokens.
    ...history.map(
      (m): LlmMessage => ({
        role: m.role,
        content: m.role === "assistant" ? m.text + chartNotes(m) : m.text,
      }),
    ),
  ];
  const question = history.at(-1)?.text ?? "";
  const wantsChart = WANTS_CHART.test(question);
  const askedMonths = monthsAsked(question);
  let dataToolsRan = false; // any tool besides show_chart this turn
  // The last chartable data the model fetched this turn: drawn by the server if it forgets show_chart.
  let lastChartable: { tool: string; args: Record<string, unknown> } | null = null;
  let checked = false; // the honesty check below sends the model back at most once

  const charts: ChartSpec[] = [];
  let whatIf: WhatIf | undefined; // the last what_if_spending result opens the what-if view

  for (let round = 1; round <= MAX_TOOL_ROUNDS; round++) {
    console.log(`[ai] round ${round}: asking LLM…`);
    const start = Date.now();
    let msg;
    try {
      msg = await chatCompletion({
        baseURL: config.baseURL,
        apiKey: config.apiKey,
        model: config.model,
        messages,
        tools: TOOL_DEFINITIONS,
        reasoningEffort: config.reasoningEffort,
        timeoutMs: LLM_TIMEOUT_MS,
      });
    } catch (err) {
      const explained = explainLlmError(err, config.model);
      console.error(`[ai] round ${round}: FAILED after ${ms(start)} — ${explained}`);
      throw new Error(explained);
    }

    const toolCalls = (msg.tool_calls ?? []).filter((c) => c.type === "function");

    // No tool calls → the model has written its final answer.
    // HONESTY CHECK (before it reaches the user): numbers must come from a tool run THIS turn,
    // and a promised chart must exist. If not, send the model back once to do it properly.
    if (toolCalls.length === 0) {
      const text = msg.content ?? "";
      const inventedNumbers = HAS_EURO_AMOUNT.test(text) && !dataToolsRan;
      // Fetched chartable data but didn't draw it, and the user wants a chart (or it's a trend
      // over time) → the server draws exactly that data. No guessing, no second LLM round.
      if (charts.length === 0 && !whatIf && lastChartable &&
          (wantsChart || lastChartable.tool === "money_over_time")) {
        const auto = runTool("show_chart", {
          ...autoChartArgs(lastChartable.tool, lastChartable.args),
          data_tool: lastChartable.tool,
          data_args: lastChartable.args,
        });
        // WHY ≥ 2 rows: one number ("salary in March") needs no chart.
        if (auto.chart && auto.chart.rows.length >= 2) {
          console.log(`[ai] model drew no chart — drew ${lastChartable.tool} itself (${auto.chart.title})`);
          charts.push(auto.chart);
        }
      }
      const missingChart = wantsChart && charts.length === 0 && !whatIf;
      if ((inventedNumbers || missingChart) && !checked && round < MAX_TOOL_ROUNDS) {
        checked = true;
        const problem = inventedNumbers
          ? "Your answer contains euro amounts, but you called no data tool in this turn, so they are not from the data."
          : "The user asked to see a chart, but you did not call show_chart, so no chart was shown.";
        console.warn(`[ai] round ${round}: honesty check failed (${problem}) — asking again`);
        messages.push({ role: "assistant", content: text });
        messages.push({
          role: "user",
          content:
            `(Automatic check, not from the user) ${problem} Call the right data tool now ` +
            `(money_over_time covers income, spending, kept and balance for any number of months), ` +
            `then show_chart if a chart fits, and answer only with numbers from the tool results.`,
        });
        continue;
      }
      if (inventedNumbers) {
        // Still no data after the second try: never show made-up numbers.
        console.warn("[ai] honesty check failed twice — replacing the answer");
        return {
          reply: {
            role: "assistant",
            text: "I couldn't look that up properly just now. Try asking a bit differently, e.g. \"income vs spending last 6 months\".",
            charts: fallbackCharts(history),
          },
          mode: "live",
        };
      }
      console.log(
        `[ai] round ${round}: final answer in ${ms(start)} (${(msg.content ?? "").length} chars)`,
      );
      if (!msg.content) console.warn("[ai] warning: final answer is empty");
      // No chart from the model → safety net adds one, unless the what-if
      // view opens (that panel already is the visual).
      const shown = charts.length > 0 || whatIf ? charts : fallbackCharts(history);
      // Asked for a chart and still none: say so instead of pretending.
      const noChartNote =
        wantsChart && shown.length === 0 && !whatIf
          ? '\n\n(I couldn\'t draw a chart for that. Try e.g. "income vs spending last 6 months as a chart".)'
          : "";
      return {
        reply: {
          role: "assistant",
          // WHY: team style, no long dashes; the prompt asks, this makes sure (lib/noDashes.ts).
          text: noLongDashes(text.replace(/\[chart shown:[^\]]*\]/g, "").trim()) + noChartNote,
          charts: shown,
          whatIf,
        },
        mode: "live",
      };
    }

    console.log(
      `[ai] round ${round}: LLM replied in ${ms(start)}, wants ${toolCalls.length} tool(s)`,
    );

    // Run every requested tool and send the results back to the model.
    messages.push(msg);
    for (const call of toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        console.warn(
          `[ai]   ${call.function.name}: bad JSON arguments, using defaults:`,
          call.function.arguments,
        );
      }
      // The user's own "N months" wins over what the model guessed.
      if (askedMonths) {
        if (
          call.function.name === "show_chart" &&
          usesMonthsRange(String(args.data_tool)) &&
          args.data_args &&
          typeof args.data_args === "object"
        ) {
          args = { ...args, data_args: withMonths(args.data_args as Record<string, unknown>, askedMonths) };
        } else if (usesMonthsRange(call.function.name)) {
          args = withMonths(args, askedMonths);
        }
      }
      let result;
      try {
        result = runTool(call.function.name, args);
      } catch (err) {
        // WHY catch per tool: a bug in one data function shouldn't kill the
        // whole answer. The LLM is told the tool failed and can say so.
        console.error(`[ai]   ${call.function.name}: TOOL CRASHED —`, err);
        result = {
          content: JSON.stringify({
            error: `Tool failed: ${err instanceof Error ? err.message : err}`,
          }),
        };
      }
      console.log(
        `[ai]   ${call.function.name}(${JSON.stringify(args)}) → ${result.content.slice(0, 150)}`,
      );
      if (call.function.name !== "show_chart") dataToolsRan = true;
      if (isChartable(call.function.name)) lastChartable = { tool: call.function.name, args };
      if ("chart" in result && result.chart) charts.push(result.chart);
      if ("whatIf" in result && result.whatIf) whatIf = result.whatIf;
      messages.push({ role: "tool", tool_call_id: call.id, content: result.content });
    }
  }

  console.warn(`[ai] stopped after ${MAX_TOOL_ROUNDS} rounds without a final answer`);
  return {
    reply: {
      role: "assistant",
      text: "Sorry, I got stuck working that out. Could you ask in a different way?",
      charts,
      whatIf,
    },
    mode: "live",
  };
}
