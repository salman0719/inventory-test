# Inventory pre-MVP prototype

A disposable pre-MVP inventory and purchasing product for small-to-medium
Australian businesses, built to validate demand before investing in a production
MVP. The code may later be discarded; the learning, workflows, design decisions,
customer feedback and technical lessons are kept in `docs/`.

The demo ships two switchable business datasets on one generic inventory engine:
**Demo Cafe** and **Demo Retail**.

## Start here

1. Read `AGENTS.md` completely — it carries the binding rules and approval gates.
2. Read `docs/product-requirements.md` and `docs/plans/roadmap.md`.
3. Complete Phase 0 discovery and design exploration before building the product.
4. Record material choices in `docs/decisions/`.
5. Do not skip approval gates.

## Current state

The repository is a runnable shell: Next.js App Router, Tailwind with role-token
theming, Postgres via compose, Drizzle schema, Vitest, Playwright and a CI job that
runs the gates, then smoke and E2E against a started server. It has **no product
features and no authentication yet**. See `docs/implementation-status.md`.

Phase 1 research is complete and Gate A is approved; Phase 2 design exploration is
next. No product code exists yet.

## Stack

Current implementation:

- Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4
- Postgres 17 (`docker-compose.yml`), Drizzle schema in `db/schema.ts`
- npm + Node 22 (`.nvmrc`), Vitest, Playwright

Target stack, decided at Gate A: hybrid Supabase (Postgres, Auth, Storage) with
Drizzle migrations, plus `shadcn/ui` and Vercel. See
`docs/decisions/0005-stack-hybrid-supabase.md`; RLS mechanics are ratified at
Gate C and no hosted resource exists yet.

Keep the architecture simple. Do not introduce Redis, microservices, a separate
backend service, Docker infrastructure beyond the local database, UploadThing,
Better Auth, or other services unless a concrete requirement justifies it and the
user approves.

## Running it

```bash
npm install
npm run new:ports     # writes .env.local with free ports (never reuse an existing one)
npm run dev           # reads PORT from .env.local
```

Quality gates: `npm run check`, `npm run test`, `npm run build`,
`npm run secrets:check`. Database: `npm run db:generate`, `npm run db:migrate`,
`npm run db:seed`.

## Repository documents

| File                             | Purpose                                                |
| -------------------------------- | ------------------------------------------------------ |
| `AGENTS.md`                      | Operating instructions, stack rules, approval gates    |
| `docs/product-requirements.md`   | Product vision, scope, workflows, exclusions           |
| `docs/product-scope.md`          | Short in/out-of-scope summary                          |
| `docs/personas.md`               | Hypothesis personas and jobs to be done                |
| `docs/plans/roadmap.md`          | Staged execution plan and approval gates               |
| `docs/competitor-research.md`    | Public-source competitor research and constraints      |
| `docs/design-exploration.md`     | Interactive design exploration requirements            |
| `docs/technical-architecture.md` | Architecture and implementation principles             |
| `docs/database-schema.md`        | Initial data model guidance                            |
| `docs/decisions/`                | Decision log, one file per decision                    |
| `docs/implementation-status.md`  | Progress and verification tracking                     |
| `docs/known-limitations.md`      | Prototype limitations and risks                        |
| `docs/customer-validation.md`    | Demo script and customer interview notes               |
| `docs/mvp-recommendations.md`    | Lessons and recommendations for a later production MVP |

## Definition of success

A potential customer can use the demo without coaching to:

1. Find a product and understand its current stock.
2. Identify a low-stock item.
3. Create a purchase order for a supplier.
4. Receive all or part of that order.
5. See the stock ledger and current quantity update correctly.
6. Record a manual adjustment such as wastage or a stock count correction.
7. Understand recent activity from the dashboard and reports.

The demo should look credible, work on desktop and mobile, and allow switching
between the Cafe and Retail datasets without cross-business data leakage.
