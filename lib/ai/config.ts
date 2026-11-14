/**
 * AI settings, read from environment variables (.env.local). SERVER ONLY.
 *
 * WHY an OpenAI-compatible client: Modal (and most other hosts: vLLM,
 * Together, OpenRouter, OpenAI itself) expose the same "chat completions"
 * API. Switching model or provider = changing .env.local, not code.
 *
 * WHY mock mode: the UI person can build the chat before we have a model,
 * and the app never breaks just because a key is missing.
 */
export type AiConfig =
  | { mode: "mock" }
  | { mode: "live"; baseURL: string; apiKey: string; model: string };

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
  };
}
