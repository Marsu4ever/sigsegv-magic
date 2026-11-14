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
| 6 | **OpenAI-compatible API client**, configured in `.env.local` | Proposed | Planning to use a model hosted on **Modal**; most hosts speak this API, so switching model = config change. ⚠️ Check early that the chosen model supports **tool calling**. |
| 7 | **Mock AI mode** when no model is configured | Proposed | UI work can start before the AI exists; app never breaks on a missing key. |
| 8 | **Small per-customer JSON files** (`data/demo/`) made from the 346 MB CSV by `scripts/prepare-data.mjs` | Proposed | Big CSV is too large for git/Vercel. App only shows one person's data anyway. Raw CSV is git-ignored. |
| 9 | **`MOCK` customer** (fake data, committed) is the default | Proposed | Everyone can run the app immediately, before downloading the dataset. |
| 10 | **"Today" = latest date in the data**, not the real date | Proposed | Dataset is synthetic; real dates would make "this week" empty. |
| 11 | Weeks start **Monday**; dates handled as UTC `YYYY-MM-DD` strings | Proposed | Finnish convention; avoids timezone off-by-one bugs. |
| 12 | Unknown categories default to the **everyday** basket | Proposed | Most likely discretionary; also makes gaps in the mapping visible. |
| 13 | **Category → basket table** in `lib/data/baskets.ts` | Proposed — ⚠️ categories are guesses until real data is checked | Simple, readable, easy to debate. Can add recurring-payment detection later. |
| 14 | Spending = **negative amounts** (`isSpending()` in `lib/data/index.ts`) | ⚠️ Assumption — verify with real data | Usual bank convention. Only 2 functions to change if wrong. |
| 15 | **Chat + This week** tabs. Charts appear in chat as cards; tap → full screen | Team decided | Week tab kept simple for now. |
| 16 | Week tab uses **no AI** | Proposed | Fast, free, always works. Same data functions as the chat → numbers always match. |
| 17 | Server is **stateless**: the phone sends the whole conversation each time | Proposed | Simple, nothing to lose. Chat resets on reload (fine for a demo). |
| 18 | **Recharts** for charts | Proposed | React-friendly, covers bar/line/pie. |
| 19 | **System fonts** (no Google Fonts) | Proposed | Builds don't depend on hackathon wifi; looks native on phones. |
| 20 | **One owner per folder** (data / AI / UI / insights) | Proposed | 4 people can work at once with few merge conflicts. `lib/types.ts` is the shared contract. |
| 21 | Follow the challenge guidelines as a **default, not a rule** | Team decided | Team keeps creative freedom and makes the final call. |
| 22 | **whatIf / safeToSpend** tools | Later | Not sure we want them yet. Ideas listed in `lib/insights/README.md`. |
| 23 | **Text-to-speech (TTS)** | Later | Planned eventually. Reply text is separate from charts, so adding it later is easy (see `ChatInput.tsx` / `MessageBubble.tsx`). |

## How to add a decision
Add a row: what, status, why. Keep it to one line. If it overturns an older row, change that row's status instead of deleting it.
