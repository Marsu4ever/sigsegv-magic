/**
 * The inference provider: OpenRouter, FREE models only. SERVER ONLY.
 * Everything that talks to the model goes through askModel() (lib/ai/chat.ts, /api/health).
 *
 * Zero-cost guards (DECISIONS #71). Each one alone should be enough; together they're belt and braces:
 * 1. Only allowlisted free model IDs are sent (lib/ai/config.ts); checked again here.
 * 2. Exactly ONE model per request and never a `models` fallback list. WHY: OpenRouter's docs say
 *    a `models` list falls back to the next model when the free one is rate-limited, "and each model
 *    is billed at its own price". Without the list, fallback only happens between providers of the
 *    SAME free model.
 * 3. No retries on 429 / 402: the user gets a clear "free quota used up" message instead.
 * 4. max_tokens caps every answer; MAX_TOOL_ROUNDS (chat.ts) caps requests per question.
 * 5. Every response's reported cost is checked; anything above $0 is logged as an error.
 * The account itself must also hold no credits (README "AI setup"): then even a mistake
 * elsewhere can't be charged, OpenRouter answers 402 instead.
 */
import { isAllowedFreeModel, type AiConfig } from "./config";
import { chatCompletion, LlmError, type LlmMessage, type ToolDefinition } from "./llm";

/**
 * Max tokens per answer. WHY 2000: chat answers are a few sentences, but "thinking" models spend
 * part of this on reasoning first; too low and the answer is cut off. Free, so not about money:
 * it keeps a confused model from running for minutes.
 */
export const MAX_OUTPUT_TOKENS = 2000;

/** Max time for ONE request to the model. Free models are slower than paid ones. */
export const LLM_TIMEOUT_MS = 45_000;

/**
 * Our own limit on requests per minute, just under OpenRouter's 20/min for free models.
 * WHY: one question can take several requests (tool rounds). Stopping here gives a clear
 * message instead of a 429 halfway through an answer. Per server instance (in memory):
 * on Vercel each warm instance counts separately, so OpenRouter's own limit stays the real one.
 */
const REQUESTS_PER_MINUTE = 16;
const recent: number[] = [];

function takeRateSlot(): void {
  const now = Date.now();
  while (recent.length && now - recent[0] > 60_000) recent.shift();
  if (recent.length >= REQUESTS_PER_MINUTE) {
    const waitS = Math.ceil((60_000 - (now - recent[0])) / 1000);
    throw new LlmError(`app limit of ${REQUESTS_PER_MINUTE} AI requests per minute reached, try again in ${waitS}s`, "rate_limit", 429);
  }
  recent.push(now);
}

/** Logs which model answered and what it cost (must be 0). Never logs the key or the text. */
function checkResponse(requested: string, json: Record<string, unknown>): void {
  const usage = json.usage as { cost?: number; prompt_tokens?: number; completion_tokens?: number } | undefined;
  const cost = Number(usage?.cost ?? 0);
  const used = String(json.model ?? "?");
  console.log(
    `[ai]   openrouter: model=${used}` +
      (usage ? ` tokens=${usage.prompt_tokens ?? "?"}+${usage.completion_tokens ?? "?"}` : "") +
      (usage?.cost !== undefined ? ` cost=$${cost}` : ""),
  );
  if (cost > 0) {
    // WHY loud but not thrown: the answer already happened; hiding it helps nobody. This must
    // never appear — if it does, remove credits from the account and check FREE_MODELS.
    console.error(`[ai] ✗✗ PAID USAGE: ${requested} answered by ${used} cost $${cost}. Check FREE_MODELS and the OpenRouter account.`);
  }
}

/** One request to the configured free model. Throws LlmError on any failure (never retries). */
export async function askModel(opts: {
  config: Extract<AiConfig, { mode: "live" }>;
  messages: LlmMessage[];
  tools?: ToolDefinition[];
  toolChoice?: "required";
}): Promise<Extract<LlmMessage, { role: "assistant" }>> {
  const { config } = opts;
  // WHY check again: config.ts already did, but this is the last line before the network.
  if (!isAllowedFreeModel(config.model)) {
    throw new LlmError(`model "${config.model}" is not on the free-model allowlist`, "http");
  }
  takeRateSlot();
  return chatCompletion({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    model: config.model,
    messages: opts.messages,
    tools: opts.tools,
    toolChoice: opts.toolChoice,
    reasoningEffort: config.reasoningEffort,
    maxTokens: MAX_OUTPUT_TOKENS,
    timeoutMs: LLM_TIMEOUT_MS,
    onResponse: (json) => checkResponse(config.model, json),
  });
}
