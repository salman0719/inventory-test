# Implementation Status

Keep this file current. Do not report a task as complete until it has been verified.

## Overall status

- Current phase: Phase 4 hosted setup in progress (Gate D approved 2026-11-21)
- Current deployment: none (no Supabase or Vercel project yet)
- Last updated: 2026-11-21

## Phase checklist

### Phase 0: Repository discovery

- [x] Repository inspected
- [x] Existing conventions documented
- [x] Risks and assumptions listed (see `docs/plans/phase-0-assessment.md`)

### Phase 1: Product research

- [x] Public sources reviewed
- [x] Research log completed
- [x] Requirements prioritised
- [x] Navigation and journeys proposed
- [x] Gate A approved

### Phase 2: Design exploration

- [x] Direction A interactive prototype
- [x] Direction B interactive prototype
- [x] Direction C interactive prototype
- [x] Comparison and recommendation
- [x] Gate B approved

### Phase 3: Architecture

- [x] Architecture reviewed
- [x] Schema reviewed
- [x] RLS plan reviewed
- [x] Stock transaction design reviewed
- [x] Gate C approved

### Phase 4: Infrastructure

- [x] GitHub setup (repository and CI only; no Supabase or Vercel yet)
- [x] Migrations, seed and CI migration gate (local Postgres only)
- [x] Database integration tests in CI (tenant isolation, ledger writes)
- [x] Supabase project setup (Free, Sydney; four migrations applied; `app_user` created)
- [ ] Auth configured
- [ ] Storage configured (bucket created; tenant policy pending)
- [ ] Vercel configured
- [x] Gate D approved

### Phase 5: Implementation

- [ ] App shell and navigation
- [ ] Business selector
- [ ] Authentication
- [ ] Products
- [ ] Suppliers
- [ ] Stock ledger
- [ ] Inventory screens
- [ ] Purchase orders
- [ ] Partial receiving
- [ ] Dashboard
- [ ] Reports
- [ ] CSV workflows
- [ ] Image upload
- [ ] Seed and reset

### Phase 6: Validation

- [ ] Core journeys tested
- [ ] Partial receiving tested
- [ ] Duplicate receiving prevented
- [ ] Tenant isolation verified
- [ ] Responsive layouts checked
- [ ] Empty/loading/error states checked
- [ ] Deployment verified
- [ ] Demo walkthrough ready

## Current blockers

- None recorded.

## Recently completed

Add date, task, verification method, and result.

- **2026-11-21 — Hosted database migrated, app role provisioned.** Applied the four
  migrations to the Sydney Supabase project (`db:migrate:hosted`: 4 applied, re-run
  0 of 4 tracked). Created `app_user` with `db:app-role` (login, noinherit, no
  bypassrls, member of `authenticated`) and wrote `DATABASE_URL_APP` to
  `.env.local`. Proved hosted isolation as `app_user`: stranger sees 0 rows across
  four tables, ledger and receipt inserts `42501`, cross-business product insert
  `42501` by RLS, direct select without `SET ROLE` `42501`. Compose stays the
  day-to-day database. Key model updated to publishable/secret, since Supabase
  deprecates `anon`/`service_role` at the end of 2026.
- **2026-11-21 — Gate D approved.** DD1–DD8 accepted as recommended: Supabase Free
  in Sydney, Vercel Hobby while internal, owner connection only for migrations,
  `app_user` through the transaction pooler as `authenticated`, no service-role key,
  private image bucket, migrations run from this machine. Record in
  `docs/decisions/0008-gate-d-approval.md`. Nothing hosted existed at approval;
  Phase 4 stays in progress until the hosted database is migrated and
  `npm run test:db` passes against it.
- **2026-11-21 — Database integration tests added; Gate D checklist prepared.**
  `tests/db/tenant-isolation.test.ts` runs against real migrations in CI and
  proves cross-tenant reads return nothing, a non-member sees nothing, and the
  ledger and receipts reject direct writes. Nine tests pass locally; the suite was
  mutation-checked (RLS disabled fails four; granting INSERT on `stock_movements`
  fails one), so the assertions are not vacuous. Gate D costs, credential split and
  env vars are in `docs/plans/phase-4-gate-d-checklist.md`; nothing hosted created.
- **2026-11-21 — Phase 4 local tooling complete.** `drizzle-kit` with a real config,
  three migrations (schema, placeholder retirement, RLS and tenant isolation), real
  `db:migrate` and `db:seed` runners, and a CI step that fails when no migration
  applies. Verified against PostgreSQL 17 in compose: fresh migrate applies 3 and
  exits 0; re-run applies 0 and exits 0; `db:migrate:ci` on a current database exits
  1; seed run twice reports 2 businesses, 3 users, 3 memberships both times; 10
  tables plus `product_stock` in `public`; the four placeholder tables gone; 24
  policies; a cafe owner sees 0 retail rows; a direct ledger insert as `authenticated`
  is denied. Deviations and their causes are in
  `docs/plans/phase-3-architecture.md` §13. No hosted resource created.
- **2026-11-21 — Phase 3 complete; Gate C approved.** Architecture pack
  `docs/plans/phase-3-architecture.md` accepted with all ten decisions (DC1–DC10) as
  recommended, and the three open questions resolved in
  `docs/decisions/0007-gate-c-approval.md`. The proposed DDL had been applied to
  PostgreSQL 17.12 in a scratch database with assertions on tenant foreign keys, the
  one-open-order index, over-receipt and RLS visibility; all passed. No product code
  written.
- **2026-11-21 — Phase 3 architecture pack prepared; Gate C pending.** Architecture,
  schema, RLS and tenant isolation, stock ledger, transactional receiving, auth and
  storage, environments, testing plan, risks and ten decision points recorded in
  `docs/plans/phase-3-architecture.md`. Verified while writing: `drizzle-kit` is not
  installed, `db/migrations/` is empty, `db/migrate.ts` and `db/seed.ts` only print,
  and the CI migration step therefore passes without touching a database — listed as
  Phase 4 prerequisites. The proposed DDL was also applied to PostgreSQL 17.12 in
  a scratch database with assertions on cross-tenant foreign keys, the
  one-open-order index, over-receipt and RLS visibility; all passed. No schema or
  product code in the repository changed.
- **2026-11-21 — Phase 2 complete; Gate B approved.** Three interactive
  directions and a comparison built and exercised in `local/phase-2-design/`
  (unversioned by design). Verified in a browser: business switching, partial
  receiving with over-receipt capped at the outstanding quantity, adjustments
  writing one ledger row, drawer and modal flows, split-view selection, and
  keyboard shortcuts; no console errors. Direction C adopted, with readability
  floors, a visible panel close and optional shortcuts recorded as required
  fixes; rationale in `docs/decisions/0006-gate-b-design.md`, design system in
  `docs/design-exploration.md`.
- **2026-11-21 — Phase 1 complete; Gate A approved.** Twenty public sources
  reviewed and logged; findings, matrix and synthesis in
  `docs/competitor-research.md`; personas in `docs/personas.md`; D1–D6 accepted
  in `docs/decisions/0004-gate-a-scope.md` and
  `docs/decisions/0005-stack-hybrid-supabase.md`. Verified: every claim traces to
  a dated public source, no product code written, research deliverables in
  `local/phase-1-discovery/`.
- **2026-11-21 — Phase 0 closed.** Repository assessment, proposed immediate plan
  and the assumptions/questions list recorded in
  `docs/plans/phase-0-assessment.md`. Gate A not yet requested.
- **2026-11-21 — Repository assessed and shell made runnable.** Declared and
  installed the toolchain, added the configs and a minimal App Router entry, and
  fixed two scripts that failed on their own. Verified: `npm run check`,
  `npm run test` (1 file, 2 tests), `npm run build`, `npm run secrets:check` all
  exit 0; smoke and 1 E2E test pass against a started server; CI run 44901773015
  succeeded on GitHub.
- **2026-11-21 — Project documentation imported.** Brief material moved from the
  local kit into `docs/`; stack conflict recorded in
  `docs/decisions/0003-stack-target.md`. No product code written.
