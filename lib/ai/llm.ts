/**
 * Minimal LLM client — one function, plain `fetch`, no SDK. SERVER ONLY.
 *
 * Used through lib/ai/openrouter.ts (our provider: free models only).
 *
 * It speaks the "chat completions" JSON format. That format started at OpenAI
 * but is now a common standard: Gemini, Claude, Modal/vLLM, OpenRouter… all
 * accept it. So switching provider = changing .env.local, nothing else.
 *
 * WHY no SDK (team decision): the OpenAI SDK hid real errors — Gemini answered
 * "429 quota exceeded" in 0.2 s, but the SDK reported a 20 s timeout instead.
 * With plain fetch, every error from the provider is shown as-is.
 */

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type LlmMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[]; [extra: string]: unknown }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolDefinition = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type LlmErrorKind =
  | "timeout"
  | "network"
  | "auth"
  | "not_found"
  | "rate_limit"
  /** HTTP 402: the request would need credits. Never retried, never "fixed" by paying. */
  | "payment"
  | "overloaded"
  | "http"
  | "bad_response";

export class LlmError extends Error {
  constructor(
    message: string,
    public kind: LlmErrorKind,
    public status?: number,
    /** OpenRouter's error.metadata.limit_source, e.g. "upstream_provider_shared_pool" (model busy). */
    public limitSource?: string,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

/** OpenRouter's error.metadata.limit_source, if the body has one. */
function limitSourceOf(body: string): string | undefined {
  try {
    const src = JSON.parse(body)?.error?.metadata?.limit_source;
    return typeof src === "string" ? src : undefined;
  } catch {
    return undefined;
  }
}

/** Pulls the human-readable message out of a provider's error body. */
function providerMessage(body: string): string {
  try {
    const j = JSON.parse(body);
    // OpenAI/Claude: {error:{message}} · Gemini sometimes: [{error:{message}}]
    const msg = j?.error?.message ?? j?.[0]?.error?.message ?? j?.message;
    if (msg) return String(msg);
  } catch {
    // not JSON
  }
  return body.slice(0, 200);
}

function kindForStatus(status: number): LlmErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 402) return "payment";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limit";
  if (status === 500 || status === 502 || status === 503 || status === 529) return "overloaded";
  return "http";
}

export async function chatCompletion(opts: {
  baseURL: string;
  apiKey: string;
  model: string;
  messages: LlmMessage[];
  tools?: ToolDefinition[];
  reasoningEffort?: string;
  /** "required" = the model must call a tool this round (used to retry a made-up answer). */
  toolChoice?: "required";
  timeoutMs: number;
  /** Cap on the answer's length (tokens). */
  maxTokens?: number;
  /** Provider-specific fields added to the request body (e.g. OpenRouter's `provider`). */
  extraBody?: Record<string, unknown>;
  /** Extra HTTP headers (never put secrets here; the key goes in apiKey). */
  headers?: Record<string, string>;
  /** Sees the whole parsed response (model used, usage/cost) — for logging and checks. */
  onResponse?: (json: Record<string, unknown>) => void;
}): Promise<Extract<LlmMessage, { role: "assistant" }>> {
  const url = opts.baseURL.replace(/\/+$/, "") + "/chat/completions";
  const body = JSON.stringify({
    model: opts.model,
    messages: opts.messages,
    ...(opts.tools?.length ? { tools: opts.tools } : {}),
    // WHY only when set: not every provider accepts this field.
    ...(opts.reasoningEffort ? { reasoning_effort: opts.reasoningEffort } : {}),
    ...(opts.toolChoice ? { tool_choice: opts.toolChoice } : {}),
    ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
    ...opts.extraBody,
  });

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        ...opts.headers,
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body,
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new LlmError(`no answer within ${opts.timeoutMs / 1000}s`, "timeout");
    }
    const cause = (err as { cause?: { code?: string } })?.cause?.code ?? "";
    throw new LlmError(`could not connect (${cause || (err as Error).message})`, "network");
  }

  const text = await res.text();
  if (!res.ok) {
    throw new LlmError(providerMessage(text), kindForStatus(res.status), res.status, limitSourceOf(text));
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new LlmError(`response was not JSON: ${text.slice(0, 200)}`, "bad_response", res.status);
  }
  // WHY: OpenRouter can answer HTTP 200 with only {error:{code,message}} (e.g. the provider
  // failed or rate-limited after the request was accepted). Treat it like the HTTP error.
  const inBody = json?.error ?? json?.choices?.[0]?.error;
  if (inBody && !json?.choices?.[0]?.message?.tool_calls && !json?.choices?.[0]?.message?.content) {
    const code = Number(inBody.code);
    throw new LlmError(
      String(inBody.message ?? "provider error"),
      Number.isFinite(code) ? kindForStatus(code) : "bad_response",
      Number.isFinite(code) ? code : res.status,
      typeof inBody.metadata?.limit_source === "string" ? inBody.metadata.limit_source : undefined,
    );
  }
  opts.onResponse?.(json);
  const message = json?.choices?.[0]?.message;
  if (!message) {
    throw new LlmError(
      `response had no message: ${text.slice(0, 200)}`,
      "bad_response",
      res.status,
    );
  }
  // WHY return the message untouched: some providers (Gemini) add extra fields
  // that must be sent back unchanged in the next request.
  return { ...message, role: "assistant" };
}
