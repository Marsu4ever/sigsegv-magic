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
import type { ChartSpec, ChatMessage } from "@/lib/types";
import {
  allMerchantTypes,
  getCustomer,
  getDataToday,
  getTransactions,
  listCategories,
} from "@/lib/data";
import { getAiConfig } from "./config";
import { chatCompletion, LlmError, type LlmMessage } from "./llm";
import { buildSystemPrompt } from "./prompt";
import { TOOL_DEFINITIONS, runTool } from "./tools";
import { mockReply } from "./mock";

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

export async function runChat(history: ChatMessage[]): Promise<{
  reply: ChatMessage;
  mode: "live" | "mock";
}> {
  const config = getAiConfig();
  if (config.mode === "mock") {
    console.log("[ai] mode=mock (set LLM_BASE_URL + LLM_MODEL in .env.local for a real model)");
    return { reply: mockReply(history), mode: "mock" };
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
      }),
    },
    // WHY only text from history: earlier charts are already on screen;
    // re-sending their data would waste tokens.
    ...history.map((m): LlmMessage => ({ role: m.role, content: m.text })),
  ];

  const charts: ChartSpec[] = [];

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
    if (toolCalls.length === 0) {
      console.log(
        `[ai] round ${round}: final answer in ${ms(start)} (${(msg.content ?? "").length} chars)`,
      );
      if (!msg.content) console.warn("[ai] warning: final answer is empty");
      return {
        reply: {
          role: "assistant",
          text: msg.content ?? "",
          charts: charts.length > 0 ? charts : fallbackCharts(history),
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
      if ("chart" in result && result.chart) charts.push(result.chart);
      messages.push({ role: "tool", tool_call_id: call.id, content: result.content });
    }
  }

  console.warn(`[ai] stopped after ${MAX_TOOL_ROUNDS} rounds without a final answer`);
  return {
    reply: {
      role: "assistant",
      text: "Sorry, I got stuck working that out. Could you ask in a different way?",
      charts,
    },
    mode: "live",
  };
}
