# lib/insights — Owner: INSIGHTS person

Smarter analysis built on top of `lib/data`. Empty on purpose — this is your space.

Ideas from the challenge brief (pick what the team agrees on):
- **Benchmarks** — compare with Statistics Finland averages (by age group / postal area).
- **"What kind of spender am I?"** — classify spending patterns.
- **whatIf** — "How much could I save if I cut dining out by 20%?" *(parked for now)*
- **safeToSpend** — "What's safe for me to spend this week?" *(parked for now)*

How to plug something in:
1. Write a function here that uses `lib/data` (e.g. `getTransactions`, `basketBreakdown`).
2. To let the AI use it: add a tool in `lib/ai/tools.ts` (instructions at the top of that file).
3. Add a `// WHY:` comment for any non-obvious choice, and a line in `DECISIONS.md` for big ones.
