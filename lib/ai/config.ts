/**
 * AI settings, read from environment variables (.env.local). SERVER ONLY.
 *
 * WHY the "chat completions" format (see lib/ai/llm.ts): Modal/vLLM, Gemini,
 * Claude, OpenRouter… all accept it. Switching model or provider = changing
 * .env.local, not code.
 *
 * WHY mock mode: the UI person can build the chat before we have a model,
 * and the app never breaks just because a key is missing.
 */
import dns from "node:dns";

/**
 * WHY ipv4first: on some networks (we hit this on the Junction venue wifi)
 * IPv6 to the AI provider is broken — requests hang with no answer, while
 * IPv4 works instantly. Preferring IPv4 avoids that. Harmless elsewhere.
 * Every AI call imports this file, so this runs before any request.
 */
dns.setDefaultResultOrder("ipv4first");

export type AiConfig =
  | { mode: "mock" }
  | {
      mode: "live";
      baseURL: string;
      apiKey: string;
      model: string;
      /** Optional: "low" / "none" etc. Only sent if set. See LLM_REASONING_EFFORT. */
      reasoningEffort?: string;
    };

export function getAiConfig(): AiConfig {
  const baseURL = process.env.LLM_BASE_URL;
  const model = process.env.LLM_MODEL;
  const wantsMock = process.env.AI_MODE === "mock";

  if (wantsMock || !baseURL || !model) return { mode: "mock" };

  return {
    mode: "live",
    baseURL,
    model,
    // Some self-hosted endpoints don't need a key, but the client requires a string.
    apiKey: process.env.LLM_API_KEY || "not-needed",
    // WHY optional: "thinking" models can spend many seconds reasoning before
    // answering. A lower effort makes them much faster. Not every provider
    // supports it, so it's only sent when set in .env.local.
    reasoningEffort: process.env.LLM_REASONING_EFFORT || undefined,
  };
}
