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

| Name                                   | Local `.env.local` | Vercel preview/production | Secret | Notes                                                                |
| -------------------------------------- | ------------------ | ------------------------- | ------ | -------------------------------------------------------------------- |
| `DATABASE_URL`                         | yes                | **no**                    | yes    | Compose Postgres, day-to-day work; CI sets it directly               |
| `SUPABASE_DB_URL`                      | yes                | **no**                    | yes    | Hosted owner, session pooler. `db:migrate:hosted` only               |
| `DATABASE_URL_APP`                     | yes                | yes                       | yes    | `app_user.[ref]`, transaction pooler, port 6543, `sslmode=no-verify` |
| `SUPABASE_DB_URL_APP`                  | yes                | **no**                    | yes    | Same value as `DATABASE_URL_APP`; local alias for scripts            |
| `NEXT_PUBLIC_SUPABASE_URL`             | yes                | yes                       | no     | `https://[ref].supabase.co`                                          |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes                | yes                       | no     | `sb_publishable_…`; public by design, RLS protects data              |
| `APP_URL`                              | yes                | yes                       | no     | Local origin locally; the free `*.vercel.app` alias in Vercel        |
| `SUPABASE_SECRET_KEY`                  | only if needed     | **not set**               | yes    | `sb_secret_…` bypasses RLS; deliberately absent                      |
| `DB_AUTH_SHIM`                         | as generated       | **no**                    | no     | Local shim switch only; hosted must never apply the shim             |

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

## 10. What the owner needs to do (exact)

Approved at Gate D on 2026-11-21 (`docs/decisions/0008-gate-d-approval.md`). The
agent cannot create accounts or accept terms, so these are yours. Do not paste
secret values into chat: put them in `.env.local` (ignored by git) and the Vercel
dashboard.

### Supabase

1. Sign in at supabase.com (create an account and organisation if you have none).
2. **New project**: name `inventory-test`, region **Sydney (ap-southeast-2)**,
   plan **Free**. Generate a strong database password and keep it in your password
   manager — it is needed in the connection strings and cannot be recovered later,
   only reset.
3. Wait for provisioning, then open **Project Settings → Database → Connect** and
   copy the **Session pooler** connection string (host looks like
   `aws-N-ap-southeast-2.pooler.supabase.com`, port 5432, user
   `postgres.<project-ref>`).
4. Open the **Connect** dialog (or **Project Settings → API keys**) and copy the
   **Project URL** and the **publishable key** (`sb_publishable_…`). Do not use
   the legacy `anon` JWT: Supabase removes `anon` and `service_role` by the end of
   2026, and the new keys are not JWTs at all.
5. Open **Authentication → URL configuration** and set:
   - Site URL: your Vercel URL (tell me the preview URL and I will give you the
     exact string, or set it once step 4 of Vercel is done).
   - Redirect URLs: `http://localhost:25000/**` and
     `https://<your-vercel-project>.vercel.app/**`.
6. Open **Storage** and create a bucket named `product-images`, **private**, no
   public access. I will add the tenant policy.
7. Put these values in `.env.local`, which is ignored by git (`APP_URL` is
   already there for local development):

```
SUPABASE_DB_URL=postgresql://postgres.<ref>:<db-password>@<session-pooler-host>:5432/postgres
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

`DATABASE_URL_APP` is generated by `npm run db:app-role`, which creates
`app_user` and writes both `DATABASE_URL_APP` and `SUPABASE_DB_URL_APP` into
`.env.local`. Never the `postgres` URL in Vercel. The app URL carries
`sslmode=no-verify` because the Supavisor pooler presents a self-signed chain and
`pg` 8.23 treats `require` as `verify-full`; the connection is still encrypted.

### Vercel

1. Sign in at vercel.com and **Add New → Project**, importing
   `salman0719/inventory-test`. Keep the detected Next.js settings; no build
   overrides.
2. Add environment variables for **Preview and Production**:
   - `NEXT_PUBLIC_SUPABASE_URL` — the project URL from Supabase.
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — the `sb_publishable_…` key.
   - `APP_URL` — the project's production alias, `https://<project>.vercel.app`.
     No domain is purchased yet; the free alias is stable and is also the Auth
     Site URL. Preview deployments use their own `*.vercel.app` URL and only need
     to be in the Auth redirect allowlist.
   - `DATABASE_URL_APP` — the value written into your `.env.local` by
     `npm run db:app-role`.
3. Do **not** add `DATABASE_URL` or `SUPABASE_DB_URL` (owner) or
   `SUPABASE_SECRET_KEY`. The owner URLs bypass RLS; the secret key is unused.
4. Deploy once and send me the preview URL.

### What I need back from you (non-secret)

- Confirmation the project is created, with its **project ref** and **region**.
- The **session pooler host** (not the password).
- Confirmation the `product-images` bucket exists and is private.
- The **Vercel preview URL** once the first deployment finishes.
- A yes/no on whether the working database should stay compose for day-to-day work
  while hosted is used only for review; my default is yes.

### What I do as soon as those exist

1. Apply the four migrations to `SUPABASE_DB_URL` and confirm the count.
2. Create `app_user` (login, `noinherit`, member of `authenticated`, no
   `BYPASSRLS`), generate its password, write `SUPABASE_DB_URL_APP` into
   `.env.local`, and verify it cannot see another tenant's rows.
3. Run `npm run test:db` against the hosted project — the suite creates and deletes
   its own fixtures, so it is safe on a fresh database — plus the storage policy.
4. Give you the exact Auth Site URL and redirect strings, then verify sign-in, one
   product create, one adjusted movement and one partial receipt on the preview
   origin before I call anything working.
