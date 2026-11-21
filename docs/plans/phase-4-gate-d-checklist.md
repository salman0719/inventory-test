# Phase 4: Gate D checklist (hosted setup)

- **Date:** 2026-11-21
- **Status:** Prepared for approval. **Nothing hosted has been created.**
- **Prices checked:** 21 November 2026, supabase.com/pricing and
  vercel.com/legal/terms. Re-check before approval; plans change.

Gate D approves account actions, credentials, cost and any public deployment.
Local development is complete and unaffected by these decisions.

## 1. What would be created

| Resource                                 | Purpose                                          |
| ---------------------------------------- | ------------------------------------------------ |
| Supabase project (Sydney region)         | Postgres, Auth, Storage for the demo             |
| Five committed migrations applied to it  | Schema, legacy retirement, RLS, schema grant     |
| `app_user` database role                 | Non-superuser login the app uses, so RLS applies |
| Private `product-images` bucket + policy | Product images, tenant-scoped                    |
| Supabase Auth settings                   | Email/password, confirmation, redirect URLs      |
| Vercel project linked to this repository | Preview and demo deployments                     |
| Environment variables in Vercel          | Runtime configuration, no owner database URL     |

Not created: custom domain, email provider, monitoring, analytics, paid add-ons.

## 2. Costs

| Item     | Option   | Cost                   | What that buys                                                                                                                                                                                                          |
| -------- | -------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase | Free     | **$0/month**           | 500 MB database, 1 GB file storage, 50,000 MAU, 5 GB egress, 2 active projects. **Pauses after 1 week of inactivity**, no backups, 1-day logs                                                                           |
| Supabase | Pro      | **from $25/month**     | 8 GB disk per project, 100 GB storage, 250 GB egress, daily backups kept 7 days, no inactivity pause. Includes $10/month compute credit that covers one Micro instance; a second Micro project makes it about $35/month |
| Vercel   | Hobby    | **$0/month**           | Preview and production deployments. **Personal, non-commercial use only** (Terms of Service §4); Vercel may remove Hobby deployments                                                                                    |
| Vercel   | Pro      | **$20/month per user** | Commercial use, higher limits, team features                                                                                                                                                                            |
| Domain   | optional | ~$15–25/year           | Not needed; a `*.vercel.app` URL is enough for review                                                                                                                                                                   |

**For building and internal review: $0 total.** For customer validation that is
part of selling, budget **$45/month** (Supabase Pro $25 + Vercel Pro $20) — or
Supabase Free + Vercel Hobby if demos stay informal and non-commercial. The
free Supabase project pausing after a week idle is the reason I would not run a
customer demo on it without checking it first.

## 3. Decisions requested (DD1–DD8)

| ID  | Decision                           | Recommendation                                                                                                                                                |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DD1 | Supabase plan for now              | **Free**, with a manual "wake the project" check before any demo. Upgrade to Pro ($25) for the validation month if demos matter                               |
| DD2 | Region                             | **Sydney (`ap-southeast-2`)** — the users are Australian                                                                                                      |
| DD3 | Vercel plan                        | **Hobby** for internal review. Move to Pro ($20) before anything commercial, per §4 of their terms                                                            |
| DD4 | Database credentials split         | Migrations as `postgres` (owner) via the **session pooler**; the app as `app_user` via the **transaction pooler**, running as `authenticated` per transaction |
| DD5 | Service-role key in Vercel         | **Not set initially.** All writes go through RLS and SQL functions; the key is added only if an admin task genuinely needs it                                 |
| DD6 | Auth method                        | Email/password with confirmation on, built-in Supabase email. Custom SMTP only if demo volume needs it                                                        |
| DD7 | Storage                            | Private `product-images` bucket, signed URLs, 5 MB limit, path `{business_id}/{product_id}/{uuid}.{ext}`                                                      |
| DD8 | Who runs migrations against hosted | Me, from this machine, after approval — never from a Vercel build                                                                                             |

## 4. Why the credential split matters

RLS only protects data if the connection cannot bypass it. The owner role
(`postgres`) is a superuser, so a `postgres` connection string in the running app
would make every policy decorative — the exact failure mode Gate C was designed
to avoid.

The plan therefore mirrors what the tests already prove locally:

1. Create a login role that is not a superuser and holds no `BYPASSRLS`:
   `create role app_user login password '<generated>' noinherit;`
   `grant authenticated to app_user;`
2. The app connects as `app_user` and, for each unit of work, runs
   `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '<claims>'; …`
3. Transaction-scoped `SET LOCAL` is required because the transaction pooler
   reuses server connections between clients; a session-level `SET ROLE` would
   leak identity across tenants.
4. Migrations use the owner connection separately and are never reachable from
   the deployed app.

Supabase's shared pooler accepts a custom role as the username in the form
`[ROLE].[PROJECT-REF]` (its documentation: direct and dedicated pooler use
`postgres`; shared pooler uses `postgres.[ref]`, or `[role].[ref]` for a custom
role). Port 5432 is session mode, 6543 is transaction mode. The direct host
`db.<ref>.supabase.co` is IPv6-only, so the pooler is the practical choice.

## 5. Environment variables

Values are entered by you into `.env.local` and the Vercel dashboard. They never
go in chat, in the repository, or in any committed file.

| Name                            | Local `.env.local` | Vercel preview/production | Secret | Notes                                                              |
| ------------------------------- | ------------------ | ------------------------- | ------ | ------------------------------------------------------------------ |
| `DATABASE_URL`                  | yes                | **no**                    | yes    | Owner role, session pooler, port 5432. Migrations and seed only    |
| `DATABASE_URL_APP`              | yes                | yes                       | yes    | `app_user.[ref]`, transaction pooler, port 6543, `sslmode=require` |
| `NEXT_PUBLIC_SUPABASE_URL`      | yes                | yes                       | no     | `https://[ref].supabase.co`                                        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes                | yes                       | no     | Public by design; RLS is what protects data                        |
| `APP_URL`                       | yes                | yes                       | no     | Local origin, preview origin, or demo origin per environment       |
| `SUPABASE_SERVICE_ROLE_KEY`     | only if needed     | **not set**               | yes    | Server-only; deliberately absent at first                          |
| `DB_AUTH_SHIM`                  | as generated       | **no**                    | no     | Local shim switch only; hosted must never apply the shim           |

Existing variables (`PORT`, `APP_URL`, Mailpit and Adminer ports) stay local-only.

## 6. Sequence after approval

1. You create the Supabase project in Sydney on the chosen plan, and the Vercel
   project linked to `salman0719/inventory-test`. I cannot create accounts or
   accept terms on your behalf.
2. You place the two connection strings, the project URL and the anon key in
   `.env.local` and in Vercel's environment settings.
3. I run `npm run db:migrate` against the hosted `DATABASE_URL` and confirm four
   migrations apply. I create `app_user` with a password you supply out of band,
   then verify `app_user` cannot bypass RLS.
4. I apply the storage bucket and its policy, and the Auth redirect URLs for the
   local origin and the preview origin.
5. I run `npm run test:db` against the hosted database — the suite creates its own
   fixtures and deletes them, so it is safe on a fresh project and proves
   isolation there, not just locally.
6. You trigger the first preview deployment; I verify sign-in, one create, one
   adjusted movement and one partial receipt on the preview origin before calling
   it working.

## 7. Risks

| Risk                                                                 | Mitigation                                                                                                     |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Owner connection string leaks into the app and silently disables RLS | `DATABASE_URL` is absent from Vercel; the DB test asserts grants and isolation; review env names before deploy |
| Session-level `SET ROLE` leaking identity through the pooler         | Only transaction-scoped `SET LOCAL` is used, as the tests do                                                   |
| Free project paused after a week idle                                | Wake it before demos, or upgrade for the validation month                                                      |
| Vercel Hobby non-commercial clause                                   | Stay on Hobby only while internal; upgrade before selling or paid pilots                                       |
| Auth email rate limits on the built-in SMTP                          | Fine for a handful of demo accounts; add a provider if sign-up volume grows                                    |
| Migrations drifting from the repository                              | Migrations are committed, append-only, and applied explicitly; CI still runs them on its own Postgres          |
| Demo data on a hosted database                                       | The seed refuses to run hosted; demo rows are created through the app or a reviewed script, never by `db:seed` |

## 8. Rollback

Deleting the Supabase project removes its database, storage and auth users.
Deleting the Vercel project removes deployments. Neither affects the repository,
local compose or CI. No paid commitment is needed for either rollback.

## 9. Approval

Reply with approval or amendments for DD1–DD8. Approving DD1–DD8 authorises
account creation, environment configuration and one preview deployment. It does
not authorise a custom domain, a paid plan upgrade, or a public production launch;
those stay separate approvals.
