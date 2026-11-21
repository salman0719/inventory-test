# 0003 Stack target: Supabase or the current Postgres/Drizzle setup

- **Date:** 2026-11-21
- **Status:** Proposed — needs Approval Gate C
- **Context:** The brief targets Supabase PostgreSQL, Supabase Auth, Supabase
  Storage and Vercel, and asks to avoid Docker. This repository already ships
  Postgres 17 through `docker-compose.yml`, a Drizzle schema in `db/schema.ts`,
  committed migrations and the `db:generate` / `db:migrate` / `db:seed` scripts,
  with CI running the migration step against a Postgres service container.
- **Options considered:**
  1. **Adopt Supabase.** Supabase Postgres with RLS, Supabase Auth and Storage on
     Vercel. Retire the compose database and the Drizzle migration path.
  2. **Keep Postgres + Drizzle now.** Add Supabase only when RLS, Auth or Storage
     is actually needed, and re-evaluate at that point.
  3. **Hybrid.** Supabase Postgres as the host, Drizzle as the migration and type
     layer, Supabase Auth/Storage for the managed pieces.
- **Decision:** Pending. No migration either way without explicit approval.
- **Reasoning:** Options differ in more than tooling. RLS as the isolation
  mechanism, managed Auth/Storage, and the local compose workflow all change what
  the first vertical slice looks like, so this belongs at Gate C alongside the
  schema and stock-ledger design.
- **Consequences while pending:** `docker-compose.yml`, `db/schema.ts` and the
  `db:*` scripts stay as they are. Do not add Supabase dependencies, credentials
  or RLS policies until this is decided.
