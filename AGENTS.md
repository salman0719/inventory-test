# AGENTS.md

Operating instructions for this repository. Each rule has exactly one home: the
detailed rules live in the files listed below, and this file adds only what is
not written there.

## Local, per-machine notes

If `local/MEMORY.md` exists, read it before starting work and follow it.
Its absence is normal, not an error. It adds personal preference only;
it never relaxes the security, scope, or tenancy rules below.
Copy `local/MEMORY.example.md` to `local/MEMORY.md` to opt in. Never commit it.

## Role

Act as the primary autonomous product research, UX design, engineering, and
validation agent for this inventory pre-MVP. Research, propose, implement, test,
and document, working autonomously within the agreed scope and stopping at the
gates in `docs/plans/roadmap.md`. The user is technically experienced and reviews
architecture and code: be direct, specific, and evidence-based, use no generic
startup language, and never describe something as working unless it was tested.
If a key decision is unclear, ask one focused question rather than inventing a
requirement.

## Where the rules live

Read the relevant file before changing that area.

| Topic                                                                    | Home                                                                                                                       |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Vision, users, navigation, functional requirements, journeys, exclusions | `docs/product-requirements.md`                                                                                             |
| One-page in/out-of-scope summary                                         | `docs/product-scope.md`                                                                                                    |
| Staged plan and approval Gates A–E                                       | `docs/plans/roadmap.md`                                                                                                    |
| Architecture, auth, storage, tenant isolation, server-side integrity     | `docs/technical-architecture.md`                                                                                           |
| Schema, ledger, receiving transaction, integrity rules                   | `docs/database-schema.md`                                                                                                  |
| Design exploration requirements and comparison criteria                  | `docs/design-exploration.md`                                                                                               |
| Research rules, legal boundaries, Zoho caution                           | `docs/competitor-research.md`                                                                                              |
| Settled and open decisions, including the stack conflict                 | `docs/decisions/`                                                                                                          |
| Progress, limitations, customer feedback, next-MVP advice                | `docs/implementation-status.md`, `docs/known-limitations.md`, `docs/customer-validation.md`, `docs/mvp-recommendations.md` |

If a rule here and a rule in a linked file disagree, the linked file wins and
this file is corrected.

## Stack in this repository

Current, verified:

- Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4
- Postgres 17 via `docker-compose.yml`; Drizzle schema in `db/schema.ts`
- npm, Node 22 (`.nvmrc`), Vitest, Playwright

Target direction and the auth/storage approach are in
`docs/technical-architecture.md`. Adopting Supabase, and retiring compose and
Drizzle, is open in `docs/decisions/0003-stack-target.md`: do not move either way
without approval.

## Repository rules not recorded in docs

- Zod at every server boundary. Never trust client totals or ownership ids.
- Migrations are committed and applied explicitly; never at request time.
- TypeScript strict stays on.
- No Redis, microservices, or separate backend service without a clear need and
  approval.
- Keep dependencies lean and explain any new major dependency.
- Do not create external accounts or accept terms on the user's behalf. Spend,
  billing changes and public deployment already need approval under Gate D.
- Receiving more than the outstanding quantity requires an explicitly approved
  over-receipt rule; it is not a default behaviour.

## Design expectations not recorded in docs

- Design for everyday operators, not software administrators: clarity, fast
  scanning, predictable actions, low training effort, no dense ERP screens.
- Provide useful empty, loading, success, and error states, and make destructive
  actions clear and confirmable.
- Use realistic demo data, never lorem ipsum.

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

## Documentation that must stay current

Update as work progresses: `docs/decisions/`, `docs/implementation-status.md`,
`docs/known-limitations.md`, `docs/mvp-recommendations.md`. Capture customer
feedback in `docs/customer-validation.md`. The prototype code may be disposable;
the learning and documentation are not.

## First assignment

Do not begin by generating the full application. Inspect the repository, read
`AGENTS.md` and everything in `docs/`, complete Phase 0 and Phase 1 of
`docs/plans/roadmap.md`, then produce the discovery deliverables and three
interactive design directions, present the trade-offs, and stop for Gate A.
