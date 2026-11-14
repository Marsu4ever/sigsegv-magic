# Decisions log

Why things are the way they are. **Add a line when you make a choice others should know about.**
Smaller "why"s live in the code as `// WHY:` comments.

Status: **Team decided** = agreed · **Proposed** = default choice from setup, change it if you disagree · **Later** = parked.

| # | Decision | Status | Why |
|---|---|---|---|
| 1 | **Web app** (not native), mobile-first, phone-sized layout | Team decided | Challenge says a web app embeddable in S-mobiili is fine. One codebase, instant testing in any browser. |
| 2 | **Next.js + TypeScript + Tailwind**, frontend + backend in one project | Team decided | One language for everyone. API routes = backend, no separate server to run. Easy Vercel deploy. |
| 3 | **3 baskets** (mandatory regular / mandatory irregular / everyday) as the core concept | Team decided (some reservations — open to revisit) | Matches the challenge's pedagogical angle; judges value it. |
| 4 | **AI uses tools, never does math itself** | Proposed | Numbers come from tested code in `lib/data` → trustworthy coach. Easy to explain to judges. |
| 5 | **Chart numbers come from data functions, not from the AI** (`show_chart` re-runs a data tool) | Proposed | The AI picks chart type + title; it can't accidentally change a number. |
| 6 | **No AI SDK: a ~100-line `fetch` client** (`lib/ai/llm.ts`) speaking the standard "chat completions" format, configured in `.env.local` | Team decided | Works with Modal, Gemini, Claude, OpenRouter… Switching provider = config change. Replaced the OpenAI SDK because it hid real errors (showed a 20 s timeout when Gemini had answered "429 quota exceeded" in 0.2 s). ⚠️ Check early that the chosen model supports **tool calling**. |
| 6b | **Claude via its OpenAI-compatible endpoint** for now, switch to Modal later | Proposed | No Modal access yet. Zero code change: only `.env.local` differs. Note: Anthropic calls this layer a testing tool, not for production — fine for a hackathon; tool-argument schemas aren't strictly enforced, which `lib/ai/tools.ts` already handles. |
| 7 | **Mock AI mode** when no model is configured | Proposed | UI work can start before the AI exists; app never breaks on a missing key. |
| 8 | **Small per-customer JSON files** (`data/demo/`) made from the 346 MB CSV by `scripts/prepare-data.mjs` | Proposed | Big CSV is too large for git/Vercel. App only shows one person's data anyway. Raw CSV is git-ignored. |
| 9 | **30 VARIED demo customers** in `data/demo/` (~6 MB): 6 per age group (18-25, 26-35, 36-50, 51-65, 66+), spread from low to high spenders within each group. Default: `CUST00313` (age 23, balanced). `MOCK` stays as a fallback | Team decided | Replaced an earlier "most transactions" pick, which only selected heavy spenders. Remake with `npm run prepare-data` (this is now its default). |
| 10 | **"Today" = latest date in the data**, not the real date | Proposed | Dataset is synthetic; real dates would make "this week" empty. |
| 11 | Weeks start **Monday**; dates handled as UTC `YYYY-MM-DD` strings | Proposed | Finnish convention; avoids timezone off-by-one bugs. |
| 12 | Unknown categories default to the **everyday** basket | Proposed | Most likely discretionary; also makes gaps in the mapping visible. |
| 13 | **Category → basket table** in `lib/data/baskets.ts`, using the **real 15 dataset categories**. Taxis (MCC 4121) → everyday | Proposed | Housing, Utilities, Groceries, Transportation = regular · Health, Home & Tech = irregular · Restaurants, Entertainment, Lifestyle, Travel = everyday. Groceries and Home & Tech are debatable. |
| 14 | Spending = **negative amounts, excluding transfers to savings** (Invest Deposit / Invest Withdraw / Salary Sweep) | Verified with real data | Purchases and bills are negative, income positive. Investment deposits are negative too but aren't spending. |
| 9b | **Benchmarks file** `data/benchmarks.json` (~9 KB) from ALL 5,100 customers: per-month spending per category + total + income; mean, median, p25–p75; overall and per age group. Built by `npm run benchmarks`; read by `lib/insights/benchmarks.ts` (`compareToPeers()`) | Team decided | Compare to peers without storing everyone. Per category (dataset facts), not per basket (our interpretation). Not yet wired into the AI/UI. |
| 14b | **Merchant types from MCC codes** (`lib/data/merchantTypes.ts`): search words like "taxi" match the merchant type, not only the category | Proposed | Dataset has only 15 broad categories, but the brief's example question is about taxis. |
| 15 | **Chat + This week** tabs. Charts appear in chat as cards; tap → full screen | Team decided | Week tab kept simple for now. |
| 15b | **Week tab = last 7 days** (ending on the last day in the data), not the calendar week | Team decided | The dataset ends mid-week (30 Sep 2026), so the calendar week was often empty. "This week" in the chat uses the same rule. |
| 16 | Week tab uses **no AI** | Proposed | Fast, free, always works. Same data functions as the chat → numbers always match. |
| 17 | Server is **stateless**: the phone sends the whole conversation each time | Proposed | Simple, nothing to lose. Chat resets on reload (fine for a demo). |
| 18 | **Recharts** for charts | Proposed | React-friendly, covers bar/line/pie. |
| 19 | **System fonts** (no Google Fonts) | Proposed | Builds don't depend on hackathon wifi; looks native on phones. |
| 20 | **One owner per folder** (data / AI / UI / insights) | Proposed | 4 people can work at once with few merge conflicts. `lib/types.ts` is the shared contract. |
| 21 | Follow the challenge guidelines as a **default, not a rule** | Team decided | Team keeps creative freedom and makes the final call. |
| 21b | **Step-by-step logging + `/api/health`**: `[ai]` lines in the dev terminal, clear error messages in chat, 30 s timeout per AI request | Team decided | Find problems fast: the last log line shows where it stopped. Never logs the API key. |
| 21c | **Prefer IPv4** for outgoing AI requests (`lib/ai/config.ts`) | Proposed | Added while debugging hangs; the real cause turned out to be the model (see 21d). Harmless, can stay. |
| 21d | **Gemini model = `gemini-3.7-flash`** (free tier, via its chat-completions endpoint) | Proposed | Tested 14 Nov: 3.7 / 3.5 Flash answered (~6 s); 3.8 Flash + flash-latest hung; 2.5 Flash 404. ⚠️ Free-tier quota ran out quickly (HTTP 429) during testing. |
| 21e | **Team pages** `/dev` (team hub: links to every page + every data file), `/data`, `/customer_profiles` behind a small 🛠 button (far bottom-right of the browser window) | Team decided | Everyone can see the data, baskets, categories, chart types and demo customers without reading code. Hide it before the demo (`SHOW_DEV_BUTTON`). |
| 21f | **Customer spending types** (Saver / Spends more than earns / Everyday-heavy / Fixed-costs heavy / Balanced) in `lib/data/profiles.ts` | Proposed | Rough rules to help pick demo customers; thresholds are our own guesses. |
| 9c | **12 home-loan customers** added to `data/demo/` (~2 MB) on top of the 30 varied ones: 5 approved, 3 rejected for income, 2 for collateral, 1 for equity, 1 for existing debt. Spread by age; prefer customers who pay housing from this account. Mortgage data goes in a `mortgage` field of the customer file (left out if none). `CUST03878` (one of the 30) also has one | Proposed | 200 of 5,100 customers applied for a mortgage. About half of them move their whole salary out ("Salary Sweep") and show only ~€300/month of spending — confusing in a spending coach. The 4 rejected-for-collateral/equity/debt picks are all such customers (there are no others); they're marked "salary sweep" on `/customer_profiles`. |
| 9d | **Show the bank's mortgage decision as recorded; never our own verdict.** No ✓/✗ income check, no estimated monthly payment, no total of "costs" | Proposed | Checked 14 Nov: the decision can't be reproduced from the data (approved and rejected customers earn about the same vs. "required income"), the data has no interest rate, and recorded costs mix one-off (transfer tax) and monthly-looking items (existing loan ≤ €1,200). Mortgage payments don't show in transactions either. |
| 15c | **Home loan tab** (`/loan`), always visible; customers without a mortgage see a friendly empty state. "Ask the coach about this" opens the chat with a question (`/chat?ask=…`). AI tool: `mortgage_status`; `show_chart` can draw `mortgage_financing` | Proposed | Mortgage data is a big part of the dataset; the tab shows it without AI, the chat explains it. |
| 15d | **Demo customer is picked in the app** (dark DEMO bar at the top → list; also **Use in app** on `/customer_profiles`). Stored in a cookie, so each device can show a different customer; `DEMO_CUSTOMER_ID` in `.env.local` is only the default | Proposed | It's a demo: switching live beats editing `.env.local`. Server side: routes wrap their work in `withPickedCustomer()` (`lib/data/request.ts`), and `getCustomerId()` reads it via AsyncLocalStorage — so no data function or AI tool had to change. Hide the bar with `SHOW_CUSTOMER_SWITCHER` in `components/CustomerSwitcher.tsx`. |
| 15e | **Makefile kept tiny**: `make`, `make phone`, `make check`, `make data`. Node version in `.nvmrc` | Team decided | Easy to read; npm scripts stay the real commands (Windows teammates). |
| 22 | **whatIf / safeToSpend** tools | Later | Not sure we want them yet. Ideas listed in `lib/insights/README.md`. |
| 23 | **Text-to-speech (TTS)** | Later | Planned eventually. Reply text is separate from charts, so adding it later is easy (see `ChatInput.tsx` / `MessageBubble.tsx`). |

## How to add a decision
Add a row: what, status, why. Keep it to one line. If it overturns an older row, change that row's status instead of deleting it.
