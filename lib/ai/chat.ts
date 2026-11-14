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
import { TOOL_DEFINITIONS, runTool } from "./tools";
import { mockReply } from "./mock";
import { noLongDashes } from "@/lib/noDashes";
import { euroAfter } from "@/lib/euroAfter";
import { moneyHealthNote } from "@/lib/insights/proactive";
import { dropSentencesWith, euroAmounts, numbersIn, unsupportedAmounts } from "./amounts";

const MAX_TOOL_ROUNDS = 6;
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
function fallbackCharts(history: ChatMessage[]): ChartSpec[] {
  try {
    const found = mockReply(history).charts ?? [];
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

/**
 * One line telling the model what the user already sees under an earlier reply.
 * WHY: we send old replies as text only (charts would cost tokens), so the model didn't know
 * the leaks chart was already on screen and drew it again for every follow-up about a habit.
 */
function onScreen(m: ChatMessage): string {
  const shown = [
    ...(m.charts ?? []).map((c) => `${c.type} chart "${c.title}"`),
    ...(m.whatIf ? [`what-if view: ${m.whatIf.target.label}, ${m.whatIf.cutPct}% less`] : []),
  ];
  return shown.length ? `\n[On screen: ${shown.join("; ")}]` : "";
}

/** The model sometimes copies onScreen()'s note into its own reply; it's not for the user. */
function withoutOnScreenNotes(text: string): string {
  return text.replace(/\s*\[On screen:[^\]\n]*\]/g, "").trim();
}

export async function runChat(history: ChatMessage[]): Promise<{
  reply: ChatMessage;
  mode: "live" | "mock";
}> {
  const config = getAiConfig();
  if (config.mode === "mock") {
    console.log("[ai] mode=mock (set LLM_BASE_URL + LLM_MODEL in .env.local for a real model)");
    const reply = mockReply(history);
    return { reply: { ...reply, text: euroAfter(noLongDashes(reply.text)) }, mode: "mock" };
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
        // WHY: lets the coach help someone save before they ask (lib/insights/proactive.ts).
        moneyNote: moneyHealthNote(),
      }),
    },
    // WHY only text from history: earlier charts are already on screen; re-sending their
    // data would waste tokens. onScreen() names them in one line instead.
    ...history.map((m): LlmMessage => ({
      role: m.role,
      content: m.role === "assistant" ? m.text + onScreen(m) : m.text,
    })),
  ];

  const charts: ChartSpec[] = [];
  let whatIfBars = false; // what_if draws its own bar chart; a show_chart of it would be a twin
  let toolCallsThisTurn = 0;
  // Numbers the reply may use: from this turn's tool results + amounts already in the chat
  // (the user's own, or the coach's from earlier turns — checked when they were written).
  const knownNumbers: number[] = history.flatMap((m) => euroAmounts(m.text).map((a) => a.value));
  let nudged = false;
  // WHY force a tool after the nudge: Qwen ignored the plain "[App check]" message and wrote
  // the same made-up €89.64 again (14.94 × 6 from its own earlier text).
  let forceTool = false;
  let whatIf: WhatIf | undefined; // the last what_if_spending result opens the what-if view

  for (let round = 1; round <= MAX_TOOL_ROUNDS; round++) {
    console.log(`[ai] round ${round}: asking LLM…`);
    const start = Date.now();
    let msg;
    const ask = (toolChoice?: "required") =>
      chatCompletion({
        baseURL: config.baseURL,
        apiKey: config.apiKey,
        model: config.model,
        messages,
        tools: TOOL_DEFINITIONS,
        reasoningEffort: config.reasoningEffort,
        toolChoice,
        timeoutMs: LLM_TIMEOUT_MS,
      });
    try {
      try {
        msg = await ask(forceTool ? "required" : undefined);
      } catch (err) {
        // WHY: not every provider accepts tool_choice "required"; then ask once without it.
        if (!forceTool || !(err instanceof LlmError) || err.kind !== "http") throw err;
        console.warn(`[ai] round ${round}: tool_choice=required refused (${err.message}), asking without it`);
        msg = await ask();
      }
      forceTool = false;
    } catch (err) {
      const explained = explainLlmError(err, config.model);
      console.error(`[ai] round ${round}: FAILED after ${ms(start)} — ${explained}`);
      throw new Error(explained);
    }

    const toolCalls = (msg.tool_calls ?? []).filter((c) => c.type === "function");

    // Made-up numbers → ask once to redo the answer with tools. Two checks:
    // 1. digits but no tool call at all this turn;
    // 2. a € amount that is in no tool result of this turn and nowhere earlier in the chat.
    // WHY: Qwen invented "Cafes €48.20" (it had called show_chart only, which used to return no
    // data) and "€142.30" (after what_if returned an error) for CUST01350, who never paid at a
    // cafe. A false alarm only costs one extra round.
    if (toolCalls.length === 0 && !nudged) {
      const text = msg.content ?? "";
      const noTool = toolCallsThisTurn === 0 && /\d/.test(text);
      const invented = unsupportedAmounts(text, knownNumbers);
      if (noTool || invented.length > 0) {
        nudged = true;
        forceTool = true;
        console.warn(
          `[ai] round ${round}: ${noTool ? "numbers but no tool call" : `amounts not from any tool: ${invented.join(", ")}`} — asking again`,
        );
        messages.push(msg, {
          role: "user",
          content: noTool
            ? "[App check, not from the user] Your answer has numbers, but you called no tool in this turn, " +
              "so they may be wrong. Call the right tool(s) now and write the answer again using only " +
              "numbers from their results."
            : `[App check, not from the user] These amounts are in no tool result: ${invented.join(", ")}. ` +
              "Call the tool that returns them, or write the answer again without them. Use only " +
              "numbers from tool results.",
        });
        continue;
      }
    }

    // No tool calls → the model has written its final answer.
    if (toolCalls.length === 0) {
      let text = withoutOnScreenNotes(msg.content ?? "");
      const stillInvented = unsupportedAmounts(text, knownNumbers);
      if (stillInvented.length > 0) {
        console.warn(
          `[ai] warning: final answer still has amounts not from a tool: ${stillInvented.join(", ")} — sentences dropped`,
        );
        text =
          dropSentencesWith(text, stillInvented) ||
          "Sorry, I couldn't get that number from your data. Could you ask in a different way?";
      } else if (toolCallsThisTurn === 0 && /\d/.test(text)) {
        console.warn("[ai] warning: final answer has numbers but still no tool call");
      }
      console.log(
        `[ai] round ${round}: final answer in ${ms(start)} (${(msg.content ?? "").length} chars)`,
      );
      if (!msg.content) console.warn("[ai] warning: final answer is empty");
      return {
        reply: {
          role: "assistant",
          // WHY: team style, no long dashes and "85 €" not "€85"; the prompt asks, these make
          // sure (lib/noDashes.ts, lib/euroAfter.ts).
          text: euroAfter(noLongDashes(text)),
          // No chart from the model → safety net adds one, unless the what-if
          // view opens (that panel already is the visual).
          charts: charts.length > 0 || whatIf ? charts : fallbackCharts(history),
          whatIf,
        },
        mode: "live",
      };
    }

    console.log(
      `[ai] round ${round}: LLM replied in ${ms(start)}, wants ${toolCalls.length} tool(s)`,
    );

    // Run every requested tool and send the results back to the model.
    toolCallsThisTurn += toolCalls.length;
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
      if ("chart" in result && result.chart) {
        const isWhatIfBars =
          call.function.name === "what_if" ||
          (call.function.name === "show_chart" && args.data_tool === "what_if");
        if (isWhatIfBars && whatIfBars) {
          console.log("[ai]   skipped a second what_if bar chart");
        } else {
          charts.push(result.chart);
          whatIfBars ||= isWhatIfBars;
        }
      }
      if ("whatIf" in result && result.whatIf) whatIf = result.whatIf;
      knownNumbers.push(...numbersIn(result.content));
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
