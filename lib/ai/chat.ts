/**
 * The chat loop: user question → LLM → tools → LLM → answer. Owner: AI person.
 * SERVER ONLY. Called by app/api/chat/route.ts.
 *
 * WHY a loop: answering one question may take several tool calls
 * (e.g. this month's spending, then last month's, then a chart).
 * We cap the rounds so a confused model can't loop forever.
 */
import OpenAI from "openai";
import type { ChartSpec, ChatMessage } from "@/lib/types";
import { getCustomer, getDataToday, listCategories } from "@/lib/data";
import { getAiConfig } from "./config";
import { buildSystemPrompt } from "./prompt";
import { TOOL_DEFINITIONS, runTool } from "./tools";
import { mockReply } from "./mock";

const MAX_TOOL_ROUNDS = 6;

type LlmMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export async function runChat(history: ChatMessage[]): Promise<{
  reply: ChatMessage;
  mode: "live" | "mock";
}> {
  const config = getAiConfig();
  if (config.mode === "mock") {
    return { reply: mockReply(history), mode: "mock" };
  }

  const client = new OpenAI({ baseURL: config.baseURL, apiKey: config.apiKey });

  const messages: LlmMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt({
        today: getDataToday(),
        categories: listCategories(),
        age: getCustomer().age,
      }),
    },
    // WHY only text from history: earlier charts are already on screen;
    // re-sending their data would waste tokens.
    ...history.map((m): LlmMessage => ({ role: m.role, content: m.text })),
  ];

  const charts: ChartSpec[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const completion = await client.chat.completions.create({
      model: config.model,
      messages,
      tools: TOOL_DEFINITIONS,
    });
    const msg = completion.choices[0]?.message;
    if (!msg) throw new Error("LLM returned no message");

    const toolCalls = (msg.tool_calls ?? []).filter((c) => c.type === "function");

    // No tool calls → the model has written its final answer.
    if (toolCalls.length === 0) {
      return {
        reply: { role: "assistant", text: msg.content ?? "", charts },
        mode: "live",
      };
    }

    // Run every requested tool and send the results back to the model.
    messages.push(msg);
    for (const call of toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        // Bad JSON from the model: run with defaults, the result shows what was used.
      }
      const result = runTool(call.function.name, args);
      if (result.chart) charts.push(result.chart);
      messages.push({ role: "tool", tool_call_id: call.id, content: result.content });
    }
  }

  return {
    reply: {
      role: "assistant",
      text: "Sorry, I got stuck working that out. Could you ask in a different way?",
      charts,
    },
    mode: "live",
  };
}
