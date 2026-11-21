# Phase 0 assessment

Deliverable for Phase 0 of `docs/plans/roadmap.md`, recorded 2026-11-21 before any
product work. Every statement below comes from commands run in this repository,
not from estimates.

## 1. Repository assessment

### What exists

- A generic app shell (`saas-shell-starter`, v0.0.0) with no product features and
  no authentication.
- Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4 with ten role
  colour tokens in `src/app/theme.css`, exposed as utilities in `globals.css`.
- Postgres 17 and Mailpit via `docker-compose.yml`; a Drizzle schema with
  `tenants`, `users`, `memberships` and `audit_events` in `db/schema.ts`.
- Library stubs: `result.ts` (implemented), `permissions.ts` (`can()` always
  returns false), `readiness.ts` (always ok), `tenant-context.ts` (Zod schema),
  `app-headers.ts` (security headers, currently unwired).
- Tooling: npm, Node 22 (`.nvmrc`), Vitest, Playwright, ESLint 9 flat config,
  Prettier, tsx.
- Tests: one unit test (Result helpers) and one E2E test (root route heading).

### State at first inspection

- `package.json` declared **no** dependencies and no devDependencies, so every
  quality gate failed: `check`, `test`, `build` and `secrets:check` each exited 1.
- `src/app` contained only `theme.css`: no layout, no page, no route.
- No ESLint, Prettier, Vitest, PostCSS or Next config; `tsconfig.json` had no
  `jsx` or `lib`, so `.tsx` could not compile.
- `db/migrate.ts` and `db/seed.ts` were `console.log` placeholders, and there
  were no migrations.
- CI ran lint, test, build, smoke and E2E with no install step and no server
  started before smoke.
- Two scripts failed independently of the missing install: TypeScript annotations
  in an `.mjs` file (`scripts/check-client-secrets.mjs`), and `scripts/smoke.ts`
  was not a module, so top-level `await` and the `origin` binding failed.
- `.gitignore` had no `node_modules/`, and `local/MEMORY.example.md` is excluded
  by `local/*`, so a fresh clone cannot follow AGENTS.md's opt-in instructions.

### State at the end of Phase 0

- Toolchain declared and installed with a committed lockfile; a minimal root
  layout and page serve HTTP 200 locally.
- All four gates pass: `check` (0 errors, 2 warnings in `permissions.ts`), `test`
  (1 file, 2 tests), `build` (routes `/` and `/_not-found`), `secrets:check`.
- Smoke and 1 E2E test pass against a started production server.
- GitHub: `main` published to `salman0719/inventory-test`; CI green (run 44901773015) across install, gates, migrate, build, perf budget, Playwright
  install, then smoke and E2E against a started server.
- Deployment state: no Supabase project, no Vercel project, nothing public.

### Conventions confirmed

- Conventional commits; never commit secrets or `.env.local`; no AI trailers
  unless the author opts in.
- Colour via role tokens only, never raw palette utilities.
- `local/` is an untracked sandbox.
- Verification honesty: a gate counts only if it ran in the session and its
  real counts are quoted.

### Constraints

- No authentication, no RLS, no product schema, no seed data: every core module
  in the scope is unbuilt.
- `permissions.ts` returns false for every role, so nothing is authorised yet.
- No product images or storage bucket exists.
- `db:*` scripts are placeholders; `drizzle.config.ts` is absent, so
  `db:generate` has nothing to read.
- No paid resource, account or deployment has been created or approved.

### Existing work that was changed

Nothing was overwritten silently. The bootstrap (declaring dependencies, adding
configs, adding a root layout and page, fixing the two broken scripts, adding
`node_modules/` to `.gitignore`) was proposed and approved before it was done. The
shell's original files are otherwise intact.

## 2. Proposed immediate plan

Phase 1 only. No product code, no authentication, no design implementation until
Gate A is approved.

1. **Competitor research.** Review public product pages, help centres, API docs
   and videos for the common inventory and purchasing workflows; record URLs,
   access dates, what each source supports, and what remains unverified in
   `docs/competitor-research.md`. Respect the Zoho restriction.
2. **Prioritised feature list and personas.** Turn the baseline scope into a
   ranked list for the Cafe and Retail demonstrations, with jobs-to-be-done per
   user type.
3. **Navigation and journeys review.** Confirm the eight-item navigation and the
   four journeys in `docs/product-requirements.md` against researched
   terminology, and note any change needed at Gate A.
4. **Assumptions and risks update.** Fold the resolved questions below into
   `docs/plans/phase-0-assessment.md`, `docs/known-limitations.md` and the
   decision log.
5. **Gate A review.** Present findings and scope confirmation, then stop. Phase 2
   (three interactive design directions) starts only after approval.

Sequencing note: the stack question in `0003-stack-target.md` does not block
Phase 1 research, but it does block Gate C and any schema or auth work, so it
should be settled during the Gate A review rather than deferred.

## 3. Assumptions and questions

### Assumptions currently held

| #   | Assumption                                                    | If wrong                                        |
| --- | ------------------------------------------------------------- | ----------------------------------------------- |
| A1  | The target is Australian cafes and independent retail shops   | Seed data, terminology and journeys all shift   |
| A2  | One generic inventory engine serves both demo businesses      | Model would need per-vertical behaviour         |
| A3  | Product images are required; attachments are not yet          | Storage scope shrinks or grows                  |
| A4  | Single stock location per business is sufficient for the demo | Ledger and receiving gain a location dimension  |
| A5  | Currency is AUD only                                          | Money formatting and settings grow              |
| A6  | Demo Cafe seeds 50–70 products; Demo Retail 150–200           | Demo believability and reset time               |
| A7  | Fractional quantities matter for cafes (kg, litres)           | Quantity type can be simpler for retail         |
| A8  | Gate A and Gate B can be reviewed separately, in that order   | Design work may start against unconfirmed scope |

### Open questions

| #   | Question                                                                                                        | Blocks                    |
| --- | --------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Q1  | Supabase, current Postgres/Drizzle, or hybrid (`0003-stack-target.md`)?                                         | Gate C, schema, auth, RLS |
| Q2  | If Supabase Auth is adopted, does it replace the shell's original magic-link plan outright?                     | Auth slice                |
| Q3  | Is a Vercel deployment required for validation, or is a local demo sufficient?                                  | Gate D, CI/CD scope       |
| Q4  | With plain Postgres instead of Supabase, is isolation enforced by app-level scoping plus tests rather than RLS? | Security design           |
| Q5  | Should the Mailpit/compose mail path stay, given no email delivery is in scope?                                 | Local dev setup           |

### Not yet known

- Whether any real business values this product. No customer contact has occurred
  and Phase 1 research has not started.
- Real-world terminology and workflow expectations, pending Phase 1.
- Whether the seeded demo data can carry a convincing walkthrough.
