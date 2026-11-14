/**
 * GET /api/health — quick self-check for debugging. Open it in the browser:
 *   http://localhost:3000/api/health          → config + data check (instant, no AI call)
 *   http://localhost:3000/api/health?ping=1   → also sends ONE small request to the AI,
 *                                              with our tools, exactly like the chat does
 *
 * WHY: when something breaks, this tells you in one look whether the problem
 * is the AI settings, the AI provider, or the data. Never shows the API key.
 * WHY only one AI request: free tiers have tiny quotas; don't burn them on checks.
 */
import { connection } from "next/server";
import { getAiConfig } from "@/lib/ai/config";
import { explainLlmError, LLM_TIMEOUT_MS } from "@/lib/ai/chat";
import { chatCompletion } from "@/lib/ai/llm";
import { TOOL_DEFINITIONS } from "@/lib/ai/tools";
import { getCustomerId, getDataToday, getTransactions } from "@/lib/data";

type Check = { name: string; ok: boolean; info: string };

export async function GET(request: Request) {
  await connection();
  const checks: Check[] = [];

  // 1. Data
  try {
    const txs = getTransactions();
    checks.push({
      name: "data",
      ok: txs.length > 0,
      info: `customer=${getCustomerId()}, ${txs.length} transactions, ${txs[0]?.date} → ${getDataToday()}`,
    });
  } catch (err) {
    checks.push({
      name: "data",
      ok: false,
      info: err instanceof Error ? err.message : String(err),
    });
  }

  // 2. AI config
  const config = getAiConfig();
  checks.push({
    name: "ai-config",
    ok: true,
    info:
      config.mode === "mock"
        ? "MOCK mode. For a real model set LLM_BASE_URL and LLM_MODEL in .env.local, then restart."
        : `live: model=${config.model}, host=${new URL(config.baseURL).host}, key ${
            process.env.LLM_API_KEY ? "set" : "NOT set"
          }${config.reasoningEffort ? `, reasoning_effort=${config.reasoningEffort}` : ""}`,
  });

  // 3. Optional: one real request to the AI, like the chat sends it.
  if (new URL(request.url).searchParams.get("ping") && config.mode === "live") {
    const start = Date.now();
    try {
      const msg = await chatCompletion({
        baseURL: config.baseURL,
        apiKey: config.apiKey,
        model: config.model,
        messages: [{ role: "user", content: "Reply with just: ok" }],
        tools: TOOL_DEFINITIONS,
        reasoningEffort: config.reasoningEffort,
        timeoutMs: LLM_TIMEOUT_MS,
      });
      checks.push({
        name: "ai-ping",
        ok: true,
        info: `answered in ${Date.now() - start}ms: "${(msg.content ?? "").slice(0, 60)}"`,
      });
    } catch (err) {
      checks.push({
        name: "ai-ping",
        ok: false,
        info: `after ${Date.now() - start}ms: ${explainLlmError(err, config.model)}`,
      });
    }
  }

  const ok = checks.every((c) => c.ok);
  return Response.json({ ok, checks }, { status: ok ? 200 : 500 });
}
