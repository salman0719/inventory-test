# AGENTS.md — starter rules

## Local, per-machine notes

If `local/MEMORY.md` exists, read it before starting work and follow it.
Its absence is normal, not an error. It adds personal preference only;
it never relaxes the security, scope, or tenancy rules below.
Copy `local/MEMORY.example.md` to `local/MEMORY.md` to opt in. Never commit it.

## Stack

- Next.js App Router + TypeScript strict + Tailwind.
- Zod at every server boundary. Never trust client totals or ownership ids.
- Postgres + committed migrations. Generate offline, migrate explicitly, never at request time.

## Quality gates (run before finishing)

- `npm run check` (= lint + typecheck + format:check)
- `npm run test`
- `npm run build`
- `npm run secrets:check`

Verification honesty is repo policy: never claim a gate passed unless it ran
in this session. Quote real counts. `Not run` is a complete answer.
No guessed passes, no weakened assertions, no lint/type suppressions to make checks pass.

## Conventions

- Small, focused, conventional commits. Never commit secrets or `.env.local`.
- No AI trailers/footers unless the author opts in per commit.
- Colour via role tokens only (`ink/surface/line/accent/warning/danger/success/info/on-accent/scrim`). No raw palette utilities.
- `local/` is a sandbox: reuse a topic folder by purpose, kebab-case for new folders, one-off scripts/outputs stay in a topic folder, deliverables are HTML.
