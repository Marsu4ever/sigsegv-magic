# sigsegv-magic — Money Coach (Junction 2026 × S-Bank)

Chat with your own money. A mobile-first web app where an AI coach answers questions about your spending,
using the **3 baskets**: mandatory & regular, mandatory & irregular, and everyday spending.

📒 **Why things are built this way → [DECISIONS.md](DECISIONS.md)**

---

## Quick start (5 min)

Needs **Node.js 20.9 or newer** (`node -v`).

```bash
npm install
cp .env.example .env.local   # leave it empty for now → mock AI + fake data
npm run dev
```

Open http://localhost:3000. Saving a file updates the browser automatically.

**See it as a phone:** Chrome DevTools (`Cmd+Opt+I`) → device toolbar (`Cmd+Shift+M`) → pick an iPhone.
**On your real phone (same wifi):** `npm run dev -- -H 0.0.0.0`, then open `http://<your-laptop-ip>:3000`.

Out of the box the app uses **fake data** (`data/demo/MOCK.json`) and a **mock AI** (keyword-based answers,
shown with a yellow "mock AI" badge). Everything works without any keys.

---

## How the code runs

```
Phone (browser)                         Server (Next.js API routes)
───────────────                         ───────────────────────────
Chat tab  ── POST /api/chat ──────────► lib/ai/chat.ts ──► LLM (Modal, via .env.local)
                                              │  LLM asks for a tool
                                              ▼
                                         lib/ai/tools.ts ──► lib/data (real numbers)
                                              │
          ◄── { text, charts[] } ─────────────┘
Week tab  ── GET /api/week ───────────► lib/data → getWeekSummary()   (no AI)
```

1. User asks *"How much did I spend on taxis last month?"*
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

| Area | Folder | First tasks |
|---|---|---|
| **Data** | `lib/data/`, `scripts/` | Download dataset, run `prepare-data`, fix category → basket table in `lib/data/baskets.ts`, verify spending sign (`isSpending`) |
| **AI** | `lib/ai/` | Get a Modal model running, check it supports **tool calling**, tune the coach prompt (`prompt.ts`) |
| **UI** | `app/`, `components/` | Chat look & feel, chart cards, Week tab. Theme colors in `app/globals.css` |
| **Insights** | `lib/insights/` | Benchmarks (Statistics Finland), "what kind of spender am I?" — see `lib/insights/README.md` |

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
   ```
4. Run:
   ```bash
   npm run prepare-data                          # top 3 customers by number of transactions
   npm run prepare-data -- --customers CUST00001  # or pick specific ones
   ```
   This writes `data/demo/<customer>.json` (small — **commit these** so teammates don't need the raw CSV)
   and `data/demo/_categories.json` (every category name, to fix the basket table).
5. In `.env.local` set `DEMO_CUSTOMER_ID=CUST000xx` and restart `npm run dev`.

The script prints sample rows — check that spending amounts are negative. If not, update `isSpending()`
in `lib/data/index.ts`.

## AI setup

In `.env.local`:
```
LLM_BASE_URL=https://....modal.run/v1   # any OpenAI-compatible endpoint
LLM_API_KEY=...
LLM_MODEL=...
```
Restart `npm run dev`. The "mock AI" badge disappears when the real model is used.
Set `AI_MODE=mock` to switch back without deleting your settings.

⚠️ The model must support **tool calling** (function calling). Test this first.

---

## Git workflow (4 people, one repo)

- Never push straight to `main`. Make a branch: `git checkout -b data/basket-mapping`
- Commit small, merge often (every hour or two). Big branches = painful conflicts at 3am.
- Before pushing: `git pull origin main`, then `npm run typecheck`.
- Open a PR on GitHub, someone glances at it, merge.
- Never commit `.env.local` (it's git-ignored) or the raw CSVs in `data/raw/`.

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Run the app locally with live reload |
| `npm run typecheck` | Check types across the whole project |
| `npm run lint` | Check code style |
| `npm run build` | Production build (what Vercel runs) |
| `npm run mock-data` | Regenerate the fake `MOCK` customer |
| `npm run prepare-data` | Raw CSV → small demo customer files |

## Conventions

- `// WHY:` comment for anything non-obvious. Bigger choices → a row in `DECISIONS.md`.
- Server-only code (`lib/data`, `lib/ai`) is never imported from `"use client"` components.
- Mobile first: design for ~390 px wide, check it in the phone view.

## Deploy

Push to GitHub → import the repo on [vercel.com](https://vercel.com) → add the `.env.local` values as
environment variables. Every PR gets its own preview link.
