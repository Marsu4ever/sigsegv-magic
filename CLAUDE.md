@AGENTS.md

# Project notes for Claude (and humans)

Hackathon project: AI money coach for S-Bank (Junction 2026). Team of 4. Read README.md and DECISIONS.md first.

## Rules
- Every number shown to the user comes from `lib/data`. The AI never calculates; it calls tools (`lib/ai/tools.ts`).
- `lib/types.ts` is the shared contract between team members. Don't change it casually; say so clearly if you do.
- Stay inside the folder for the task's area (data / ai / ui / insights) unless the task needs more.
- Add a `// WHY:` comment for non-obvious choices. Add a row to `DECISIONS.md` for decisions teammates should know about.
- Mobile first (~390 px wide). Keep code simple and readable — teammates must understand it fast.
- Before finishing: `npm run typecheck` and `npm run lint` must pass.
- Never commit `.env.local` or anything in `data/raw/`.
