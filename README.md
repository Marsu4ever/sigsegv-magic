# Sentti (Junction 2026 × S-Bank, team sigsegv-magic)

Chat with your own money. Sentti is a mobile-first web app where an AI coach answers questions about your
spending, using the **3 spending types**:

| Spending type           | What it means                                     | Examples                             |
| ----------------------- | ------------------------------------------------- | ------------------------------------ |
| **Regular**             | Must-pays that come every month, about the same   | Rent, electricity, groceries, bus    |
| **Surprising expenses** | Needed, but the timing or amount is a surprise    | Dentist, broken washing machine      |
| **Everyday spending**   | Small choices that slip away and add up           | Coffees, takeaway, taxis, cinema     |

In the code the spending types are still called `Basket` (`mandatory_regular`, `mandatory_irregular`,
`everyday`). The names people see come from `BASKET_LABELS` in `lib/types.ts`; which category goes to which
type is decided in `lib/data/baskets.ts`.

📒 **Why things are built this way → [DECISIONS.md](DECISIONS.md)**

---

## Quick start (5 min)

Needs **Node.js 20.9 or newer** (`node -v`). With nvm: `nvm use` (the version is in `.nvmrc`).

```bash
make dev        # runs the app (installs packages and creates .env.local only when needed)
```

No `make` (e.g. Windows)? Same thing with npm:

```bash
npm install
cp .env.example .env.local   # leave it empty for now → mock AI + fake data
npm run dev
```

Open http://localhost:3000. Saving a file updates the browser automatically.

**See it as a phone:** Chrome DevTools (`Cmd+Opt+I`) → device toolbar (`Cmd+Shift+M`) → pick an iPhone.
**On your real phone (same wifi):** `make phone`, then open the **Network** address it prints.

**Switch demo customer:** tap **Switch** in the dark **DEMO** bar at the top of the app. The choice is per
device (a cookie). Default when nothing is picked: `DEMO_CUSTOMER_ID` in `.env.local` (empty = fake MOCK customer).

Out of the box the app uses **fake data** (`data/demo/MOCK.json`) and a **mock AI** (keyword-based answers,
shown with a yellow "mock AI" badge). Everything works without any keys.

---

## Team pages (see the data without reading code)

Click the small **🛠** in the far bottom-right corner of the browser window (or open these while `npm run dev` runs):

| Page                                    | What's there                                                                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| http://localhost:3000/dev               | **Team hub — start here.** Current customer + AI mode, links to every page and every data file (with View links), who works where |
| http://localhost:3000/data              | 8 example transactions, the 3 spending types, the 15 categories, every chart type (tap to enlarge), peer comparison, home loan data |
| http://localhost:3000/customer_profiles | All demo customers grouped by kind of spender (home-loan customers listed first), with a **Use in app** button                      |
| http://localhost:3000/api/health        | Is the data loading? Which AI settings are active?                                                                                |

Hide the 🛠 button before the demo: `SHOW_DEV_BUTTON = false` in `components/DevButton.tsx`.

---

## How the code runs

```
Phone (browser)                         Server (Next.js API routes)
───────────────                         ───────────────────────────
Coach tab ── POST /api/chat ──────────► lib/ai/chat.ts ──► LLM (Modal, via .env.local)
                                              │  LLM asks for a tool
                                              ▼
                                         lib/ai/tools.ts ──► lib/data (real numbers)
                                              │
          ◄── { text, charts[], whatIf? } ────┘
Home      ── GET /api/account ────────► lib/data/home.ts → getAccountSummary()   (no AI, start page)
Activity  ── GET /api/transactions ───► lib/data/home.ts → searchTransactions()   (search, filters; Home's recent list)
          ── GET /api/home ───────────► lib/insights → safeToSpend() + upcomingPayments()   (no AI)
Spending  ── GET /api/spending ───────► lib/insights/spendingBreakdown.ts   (month in the 3 spending types, no AI; Home)
Insights  ── GET /api/insights ───────► lib/insights/proactive.ts → proactiveInsights()   (no AI; also an AI tool; Home)
Week      ── GET /api/week ───────────► lib/data → getWeekSummary()   (no AI; Home + /week)
Home loan ── GET /api/mortgage ───────► lib/data/mortgage.ts → getMortgageSummary()   (no AI)
What-if   ── GET /api/what-if ────────► lib/insights/whatIfForecast.ts   (toggle + category buttons, no AI)
Goal      ── GET/POST /api/goal ──────► lib/goals/ → goalView() / applyGoalAction()   (saving goal + weekly mission, no AI; state in a cookie)
Lessons   ── GET /api/lessons ────────► lib/education/topics.ts → availableLessons()   (which lesson cards fit this customer, no AI; Home; progress kept on the device)
```

1. User asks _"How much did I spend on taxis last month?"_
2. `/api/chat` sends the conversation + the list of tools to the LLM.
3. The LLM calls a tool, e.g. `spend_by_category({ period: "last_month", category: "taxi" })`.
4. Our code in `lib/data` computes the **exact** number and returns it.
5. The LLM writes the answer. If it calls `show_chart`, the server runs the data tool again and attaches
   the rows as a chart — so chart numbers never come from the AI.
6. The chat shows the text + a chart card. Tap the card → full screen.

The data and the API key never leave the server.

---

## Who owns what

Each person works mostly in their own folder → fewer merge conflicts.

| Area         | Folder                  | First tasks                                                                                                                     |
| ------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Data**     | `lib/data/`, `scripts/` | Download dataset, run `prepare-data`, fix category → spending type table in `lib/data/baskets.ts`, verify spending sign (`isSpending`) |
| **AI**       | `lib/ai/`               | Get a Modal model running, check it supports **tool calling**, tune the coach prompt (`prompt.ts`)                              |
| **UI**       | `app/`, `components/`   | Coach chat look & feel, chart cards, Home and Week pages. Theme colors in `app/globals.css`                                      |
| **Insights** | `lib/insights/`         | Benchmarks (Statistics Finland), "what kind of spender am I?" — see `lib/insights/README.md`                                    |

**`lib/types.ts` is the shared contract.** Changing it affects everyone → tell the team first.

---

## Real data setup (Data person, then share the output)

The raw dataset is ~350 MB and is **not** in our git repo.

1. Go to https://github.com/hackjunction/Junction-2026-S-pankki
2. Open each CSV → **Download raw file**. (The "Download ZIP" button may give you a tiny pointer file instead
   of the real transactions CSV.)
3. Put the files in `data/raw/` (create the folder):
   ```
   data/raw/tx_junction_transactions.csv
   data/raw/tx_customers_junction.csv
   data/raw/mtg_tx_customer_link_and_final_mtg_infio.csv   # home loans: final decision per application
   data/raw/mtg_negotiation_history.csv                    # home loans: every step of each application
   ```
   ⚠️ Keep them inside `data/raw/` — only that folder is git-ignored.
4. Run:
   ```bash
   npm run prepare-data                          # 30 varied customers (6 per age group, low → high spenders)
                                                 #  + 12 home-loan customers (every approve/reject outcome)
   npm run prepare-data -- --customers CUST00001  # or pick specific ones
   ```
   This writes `data/demo/<customer>.json` (small — **commit these** so teammates don't need the raw CSV)
   and `data/demo/_categories.json` (every category name, to fix the spending type table).
5. Pick a customer with **Switch** in the dark bar at the top of the app. (Optional default for everyone:
   `DEMO_CUSTOMER_ID=CUST000xx` in `.env.local`.)

The script prints sample rows — check that spending amounts are negative. If not, update `isSpending()`
in `lib/data/index.ts`.

## AI setup

In `.env.local`:

```
LLM_BASE_URL=https://....modal.run/v1   # any "chat completions" endpoint (Modal, Gemini, Claude…)
LLM_API_KEY=...
LLM_MODEL=...
```

Restart `npm run dev`. The "mock AI" badge disappears when the real model is used.
Set `AI_MODE=mock` to switch back without deleting your settings.

⚠️ The model must support **tool calling** (function calling). Test this first.

**Our Modal server** (`ai-server/qwen_vllm.py`, Qwen3.6-35B-A3B on 1× H100, always on):
```bash
modal deploy ai-server/qwen_vllm.py   # deploy / update
modal app stop money-coach-llm        # stop the GPU bill
modal app logs money-coach-llm        # server logs
```
(`money-coach-llm` is the deployed Modal app's name from before the Sentti rename; leave it as is.)
Use `LLM_MODEL=qwen`; the base URL is in `.env.example`, the key comes from the AI person.

---

## Git workflow (4 people, one repo)

- Never push straight to `main`. Make a branch: `git checkout -b data/type-mapping`
- Commit small, merge often (every hour or two). Big branches = painful conflicts at 3am.
- Before pushing: `git pull origin main`, then `npm run typecheck`.
- Open a PR on GitHub, someone glances at it, merge.
- Never commit `.env.local` (it's git-ignored) or the raw CSVs in `data/raw/`.

## When something breaks

1. **Look at the terminal running `npm run dev`.** Every chat request logs its steps:
   ```
   [api/chat] ← "How much on taxis?" (1 messages)
   [ai] mode=live model=... host=...
   [ai] round 1: asking LLM…
   [ai] round 1: LLM replied in 1200ms, wants 1 tool(s)
   [ai]   spend_by_category({...}) → {...}
   [ai] round 2: final answer in 900ms
   [api/chat] → done in 2150ms
   ```
   The last line printed shows where it stopped. Errors say what failed and the likely fix
   (wrong key, wrong model name, rate limit, timeout…).
2. **Open http://localhost:3000/api/health** — checks the data and AI settings.
   **http://localhost:3000/api/health?ping=1** also sends ONE test request to the AI, like the chat does.
3. The chat itself shows the error message instead of hanging (30 s limit per AI request).
4. Browser-side errors: DevTools → Console (lines start with `[chat]`).
5. **`npm run diagnose`** — tests the AI connection straight from Node (DNS, IPv4, IPv6, fetch), outside the app.

## Useful commands

| Make         | What it does                                                          |
| ------------ | --------------------------------------------------------------------- |
| `make`       | List these commands                           |
| `make dev`   | Run the app (installs packages only when they are missing or changed) |
| `make phone` | Same, reachable from a phone on the same wifi |
| `make check` | Typecheck + lint — run before pushing         |
| `make data`  | Raw CSVs in `data/raw/` → `data/demo/`        |

The npm scripts underneath:

| Command                | What it does                                                                 |
| ---------------------- | ---------------------------------------------------------------------------- |
| `npm run dev`          | Run the app locally with live reload                                         |
| `npm run typecheck`    | Check types across the whole project                                         |
| `npm run lint`         | Check code style                                                             |
| `npm run build`        | Production build (what Vercel runs)                                          |
| `npm run mock-data`    | Regenerate the fake `MOCK` customer                                          |
| `npm run prepare-data` | Raw CSV → small demo customer files                                          |
| `npm run benchmarks`   | Raw CSV → `data/benchmarks.json` (averages from all customers, by age group) |
| `npm run diagnose`     | Test the AI connection from Node, outside the app                            |

## Conventions

- `// WHY:` comment for anything non-obvious. Bigger choices → a row in `DECISIONS.md`.
- Server-only code (`lib/data`, `lib/ai`) is never imported from `"use client"` components.
- Mobile first: design for ~390 px wide, check it in the phone view.

## Deploy

The demo site is on Vercel, deployed by hand with the Vercel CLI (`npx vercel --prod`).

The Vercel project needs the `.env.local` values (`LLM_BASE_URL` ending in `/v1`, `LLM_API_KEY`,
`LLM_MODEL`, optional `DEMO_CUSTOMER_ID`) as environment variables. Which build is live:
`/api/health`, `/dev`, or the bottom of the DEMO customer list.
