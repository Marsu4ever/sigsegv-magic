# OpenRouter (free models only)

The coach's model moved from our own Qwen server on Modal to **OpenRouter, free models only**.
**Zero cost is a hard rule:** the app may never cause a charge, not even by mistake. DECISIONS #71.

## A. What changed

- `lib/ai/openrouter.ts` (new) is now the only path to the model. It sends one allowlisted free model
  per request with no fallback list and `max_tokens` 2000. It applies our own limit of 16 requests a
  minute, never retries 429 or 402, and logs the model and cost of every answer. Any cost above $0
  is logged as `✗✗ PAID USAGE`.
- `lib/ai/config.ts` reads `OPENROUTER_API_KEY` / `OPENROUTER_MODEL`. The model must be on the
  `FREE_MODELS` allowlist. Any other model (paid, typo, `openrouter/auto`) puts the app in
  "blocked" mode: the chat shows the reason and **nothing is sent**.
- `lib/ai/llm.ts` (the plain-`fetch` client) adds a new `payment` error for HTTP 402. It also
  catches errors that OpenRouter returns inside an HTTP 200 body, and supports `max_tokens`.
- `lib/ai/chat.ts` (the tool loop) keeps the same tools, prompt, rounds and output. It now calls
  `askModel()`, shows a clear message when the free quota is used up or the model is busy, and
  ignores tool arguments that are valid JSON but not an object. It also tidies the model's text
  for the plain-text chat bubble: it removes `**bold**` and turns a non-breaking hyphen in
  `{‑85 €}` back into `-`, so the amount keeps its red color. Nemotron does both; Qwen did neither.
- The old `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` / `LLM_REASONING_EFFORT` variables are
  **ignored**. `ai-server/qwen_vllm.py` (Modal) is no longer used.
- **No dependency changes.** No new packages. `package.json` and the lock file are unchanged.

## B. Files

| File | Change |
| --- | --- |
| `lib/ai/openrouter.ts` | **new**: the provider, with the zero-cost guards |
| `lib/ai/config.ts` | OpenRouter env vars, `FREE_MODELS` allowlist, "blocked" mode |
| `lib/ai/llm.ts` | 402 → `payment`, error-in-200 handling, `max_tokens` / extra body / headers |
| `lib/ai/chat.ts` | uses `askModel()`; error texts; blocked mode; tool-argument check |
| `app/api/health/route.ts` | shows the OpenRouter status; the ping goes through `askModel()` |
| `app/dev/page.tsx` | shows the blocked mode |
| `scripts/diagnose-ai.mjs` | reads `OPENROUTER_*` and refuses non-free models |
| `.env.example`, `README.md`, `DECISIONS.md`, `OPENROUTER.md` | docs |

## C. Environment variables

| Name | Required | Value |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | yes (without it: mock AI) | `sk-or-v1-…` from https://openrouter.ai/settings/keys |
| `OPENROUTER_MODEL` | no | a model from `FREE_MODELS` in `lib/ai/config.ts`. Empty = `nvidia/nemotron-3.5-super-vl:free`. Fallback: `nvidia/nemotron-3-ultra-550b-a55b:free` |
| `OPENROUTER_REASONING_EFFORT` | no | e.g. `low`, for faster "thinking" models. Usually leave empty |
| `AI_MODE` | no | `mock` forces the mock AI |
| `DEMO_CUSTOMER_ID` | no | unchanged |

The build doesn't need any of these: `npm run build` works without a `.env.local`.

## D. OpenRouter account and Vercel setup

**OpenRouter account (one time, by the key owner, by hand):**

1. Sign up at https://openrouter.ai. **Don't add a card. Don't buy credits.** With a $0 balance,
   OpenRouter can't charge anything: a request for a paid model gets HTTP 402.
2. https://openrouter.ai/settings/credits: check that the balance is $0 and **auto top-up is off**.
3. https://openrouter.ai/settings/keys: create a key for this app. If the form offers a
   **credit limit**, set it to `0`. That is a second wall, for the case where someone buys credits later.
4. https://openrouter.ai/settings/privacy: if a free model fails with "No endpoints found matching
   your data policy", allow the free-endpoint / training setting. Many free providers log prompts.
   The data here is synthetic demo data, but **never send real customer data to free endpoints**.

**Vercel (the fork owner):** Project → Settings → Environment Variables:

- add `OPENROUTER_API_KEY` (mark it **Sensitive**) for Production (and Preview, if previews should talk to the model);
- optionally add `OPENROUTER_MODEL`;
- **delete** the old `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` and `LLM_REASONING_EFFORT`;
- redeploy (env changes only apply to new deployments).

No `vercel.json` or plan change is needed. Everything works on the free Hobby plan.

## E. Testing a deployment

1. `https://<site>/api/health` → `ai-config` shows `live: OpenRouter, free model=…, key set`.
   If it says `BLOCKED`, `OPENROUTER_MODEL` is not on the allowlist.
2. `https://<site>/api/health?ping=1` → `ai-ping` ok. This uses one of the 50 free requests a day.
3. In the Coach tab, ask "How much did I spend last month?". You should get an answer with real
   numbers and no "mock AI" badge.
4. Vercel → Logs: `[ai]   openrouter: model=… cost=$0` lines. There must never be a `PAID USAGE` line.

Locally: `npm run diagnose` (it sends a few requests).

## F. Limits of the free tier

- **20 requests a minute, 50 a day** per account while less than $10 of credits was ever bought.
  (1000 a day after buying $10. We don't do that: zero budget.)
- One question can take **2–7 requests** (tool rounds). So 50 a day is roughly **10–20 questions a
  day**, shared by everyone using the site. When the quota is used up, the chat says so and works
  again after the limit resets. Nothing is retried or paid.
- Free models can be slow, busy (429/503) or removed by OpenRouter without notice. Busy shows in
  the chat as "The free AI model is busy right now". Both Gemma models on the list were busy
  every time we tried them (16 Nov). If the default goes away, set `OPENROUTER_MODEL` to
  `nvidia/nemotron-3-ultra-550b-a55b:free`, or as a last resort `openrouter/free` (a random free
  model each time; not tested with our tools). To add a model to the
  list, first check https://openrouter.ai/api/v1/models: `pricing.prompt` and
  `pricing.completion` must be `"0"` and `supported_parameters` must include `"tools"`.
- Our 16 requests a minute limit is per server instance (in memory). OpenRouter's own limit is the
  real one.
- The site is public, so anyone with the link uses the shared daily quota. That costs no money,
  only availability.
