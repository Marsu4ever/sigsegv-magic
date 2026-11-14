# lib/insights — Owner: INSIGHTS person

Smarter analysis built on top of `lib/data`. Each file = one "ready-made" answer the AI can call
(wired up in `lib/ai/tools.ts`). All of them return plain numbers + `rows` for charts.

| File | AI tool | Answers |
|---|---|---|
| `benchmarks.ts` | `compare_to_peers` | "Do I spend more than people my age?" (uses `data/benchmarks.json`) |
| `spenderProfile.ts` | `spender_profile` | "What kind of spender am I?" |
| `leaks.ts` | `everyday_leaks` | "Where does my money slip away?" (small purchases add up) |
| `whatIf.ts` | `what_if` | "How much could I save if I cut X by 20 %?" |
| `safeToSpend.ts` | `safe_to_spend` | "What's safe to spend this week?" |
| `recurring.ts` | `recurring_payments` | "What are my bills / subscriptions / habits?" |
| `irregular.ts` | `irregular_buffer` | "How much should I set aside for surprise costs?" |

Formulas are deliberately simple so they can be explained to users and judges — see the comment at
the top of each file. Thresholds (e.g. "small purchase = €20") are constants you can tune.

To add one: write a function here, then add an entry to `TOOLS` in `lib/ai/tools.ts`.
Statistics Finland data could be added on top of the benchmarks later.
