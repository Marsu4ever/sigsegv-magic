/**
 * AI settings, read from environment variables (.env.local locally, Vercel env vars when deployed).
 * SERVER ONLY.
 *
 * Provider: OpenRouter, FREE models only (DECISIONS #71). Two variables:
 *   OPENROUTER_API_KEY   your key (no key → mock AI)
 *   OPENROUTER_MODEL     optional; must be on FREE_MODELS below (empty → DEFAULT_FREE_MODEL)
 *
 * WHY an allowlist and not "anything ending in :free": zero cost is a hard requirement. A typo
 * or a paid model ID in Vercel must NOT reach OpenRouter; the chat refuses instead (mode "blocked").
 * Adding a model = add its ID here after checking https://openrouter.ai/api/v1/models shows
 * prompt and completion price "0" and "tools" in supported_parameters.
 *
 * WHY mock mode: the UI person can build the chat without a key, and the app never breaks
 * just because a key is missing.
 */
import dns from "node:dns";

/**
 * WHY ipv4first: on some networks (we hit this on the Junction venue wifi)
 * IPv6 to the AI provider is broken — requests hang with no answer, while
 * IPv4 works instantly. Preferring IPv4 avoids that. Harmless elsewhere.
 * Every AI call imports this file, so this runs before any request.
 */
dns.setDefaultResultOrder("ipv4first");

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * The only models the app may call. All are $0 on OpenRouter and support tool calling
 * (checked 16 Nov 2026 against the public models list). Live-tested with our tools on 16 Nov:
 * - nemotron-3.5-super-vl: default. Right tools, often several in one reply → fewer requests
 *   per question (the free tier allows 50 a day) and fast (6–18 s per question).
 * - nemotron-3-ultra: also good, a bit slower, one more round per question. First fallback.
 * - both Gemma models: rate-limited upstream ("shared pool") every time we tried.
 * "openrouter/free" is OpenRouter's router that picks a random FREE model per request (never a
 * paid one, per its docs); allowed as a last resort, but a fixed model behaves more predictably.
 */
export const FREE_MODELS = [
  "nvidia/nemotron-3.5-super-vl:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3.5-lightning:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "openrouter/free",
] as const;

export const DEFAULT_FREE_MODEL: (typeof FREE_MODELS)[number] = "nvidia/nemotron-3.5-super-vl:free";

/** True only for IDs on the allowlist. Paid IDs, typos and auto-routers are all refused. */
export function isAllowedFreeModel(model: string): boolean {
  return (FREE_MODELS as readonly string[]).includes(model);
}

export type AiConfig =
  | { mode: "mock" }
  /** Settings exist but are not allowed (e.g. a paid model). The chat refuses; nothing is sent. */
  | { mode: "blocked"; reason: string }
  | {
      mode: "live";
      baseURL: string;
      apiKey: string;
      model: string;
      /** Optional: "low" / "none" etc. Only sent if set. See OPENROUTER_REASONING_EFFORT. */
      reasoningEffort?: string;
    };

export function getAiConfig(): AiConfig {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  const model = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_FREE_MODEL;

  if (process.env.AI_MODE === "mock" || !apiKey) return { mode: "mock" };

  if (!isAllowedFreeModel(model)) {
    return {
      mode: "blocked",
      reason:
        `OPENROUTER_MODEL "${model}" is not on the free-model allowlist (lib/ai/config.ts), ` +
        `so no request was sent. Allowed: ${FREE_MODELS.join(", ")}.`,
    };
  }

  return {
    mode: "live",
    baseURL: OPENROUTER_BASE_URL,
    model,
    apiKey,
    // WHY optional: "thinking" models can spend many seconds reasoning before
    // answering. A lower effort makes them much faster. Only sent when set.
    reasoningEffort: process.env.OPENROUTER_REASONING_EFFORT?.trim() || undefined,
  };
}
