# 0005 Stack: hybrid Supabase with Drizzle

- **Date:** 2026-11-21
- **Status:** Accepted (direction). Schema and RLS mechanics are ratified at Gate C;
  creating any hosted resource is a Gate D action.
- **Context:** `0003-stack-target.md` left the target stack open. The brief requires
  Supabase PostgreSQL with Row Level Security, Supabase Auth and Supabase Storage,
  while this repository already runs Postgres 17 through `docker-compose.yml` with
  Drizzle schema, committed migrations and a CI migration step. Gate A decided this
  had to be settled before Gate C.
- **Options considered:** adopt Supabase and retire Drizzle/compose (0003 option 1);
  keep Postgres and Drizzle and add Supabase later (option 2); hybrid (option 3).
- **Decision:** Option 3, hybrid.

## What the hybrid means

- **Database:** Supabase Postgres is the deployed database. Local development keeps
  the compose Postgres service.
- **Schema and migrations:** Drizzle stays the schema and migration layer against
  the database URL, so `db:generate` / `db:migrate` and the CI migration step
  remain meaningful. RLS policies ship as committed SQL migrations.
- **Auth:** Supabase Auth. No custom auth system and no Better Auth. Email/password
  with reset, per the brief. Magic-link is not adopted.
- **Storage:** Supabase Storage for product images; paths and metadata in Postgres.
- **Hosting:** Vercel remains the assumed target and is unapproved until Gate D.
- **Secrets:** no secret key is shipped at first; the browser sees only the
  publishable key (`sb_publishable_…`) and a session. The legacy `anon` JWT that
  this decision originally named is deprecated by Supabase at the end of 2026.

## Why not the other options

- **Option 1** retires a working local and CI setup for no validation benefit, and
  makes the first vertical slice depend on hosted infrastructure before Gate D.
- **Option 2** keeps today's stack but cannot satisfy the brief's isolation rule:
  RLS in Postgres is the stated mechanism, and without Supabase Auth there is no
  `auth.uid()` to write policies against. App-level scoping alone is the weaker
  design the brief explicitly rejects.

## Consequences and open work

- `AGENTS.md` no longer carries an unresolved stack conflict; `0003` is superseded.
- Gate C must define: policy shape per table, how local development simulates
  `auth.uid()`, and how cross-tenant access is tested.
- Gate D must approve the Supabase project, the Vercel project and any cost before
  either is created. No hosted resource has been created.
- `docs/database-schema.md` gains RLS and `business_id` obligations that the
  prototype schema does not yet implement.
