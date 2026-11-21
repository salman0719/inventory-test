# 0008 Gate D approval: hosted infrastructure

- **Date:** 2026-11-21
- **Status:** Accepted
- **Context:** `docs/plans/phase-4-gate-d-checklist.md` lists what would be created,
  verified prices (Supabase and Vercel, checked 21 November 2026), the credential
  split that keeps RLS enforceable hosted, environment variable placement, the
  sequence and rollback. No hosted resource existed at the time of approval.
- **Decision:** Approve DD1–DD8 as recommended.
- **Approved by:** Project owner, 2026-11-21.

## Approved decisions

| ID  | Decision                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DD1 | Supabase **Free** plan, with a wake-check before any demo; upgrade to Pro ($25/month) for the validation month if demos matter                                              |
| DD2 | Region **Sydney (`ap-southeast-2`)**                                                                                                                                        |
| DD3 | Vercel **Hobby** while work is internal and non-commercial; Pro ($20/month per user) before anything commercial, per Vercel's terms                                         |
| DD4 | Migrations as the `postgres` owner via the session pooler; the application as `app_user` via the transaction pooler, running `SET LOCAL ROLE authenticated` per transaction |
| DD5 | **No service-role key** in Vercel initially                                                                                                                                 |
| DD6 | Supabase Auth email/password with confirmation on, built-in email                                                                                                           |
| DD7 | Private `product-images` bucket, signed URLs, 5 MB limit, path `{business_id}/{product_id}/{uuid}.{ext}`                                                                    |
| DD8 | Migrations run by the agent from this machine, never from a Vercel build                                                                                                    |

## What this authorises

- Creating one Supabase project on the Free plan in Sydney.
- Creating one Vercel project linked to `salman0719/inventory-test`, on Hobby.
- Applying the four committed migrations to the hosted database.
- Creating the `app_user` database role and granting it `authenticated`.
- Creating the private `product-images` bucket and its tenant-scoped policy.
- Configuring Auth redirect URLs for the local origin and one preview origin.
- One preview deployment, used to verify sign-in, a create, an adjusted movement
  and a partial receipt against the hosted database.

## What this does not authorise

- A custom domain.
- A paid plan, billing change or spend commitment. Current cost is $0.
- A public production launch. Publishing is a separate approval.
- Creating any additional project or environment.

## Owner actions, and credential rules

The owner creates the accounts and accepts the terms; the agent cannot do either.
Credentials are supplied through `.env.local` and the Vercel dashboard, never chat,
never the repository.

- The owner database URL (`postgres.[ref]`) stays in `.env.local` only. It must not
  be added to Vercel, because that connection bypasses RLS and would silently undo
  the isolation the project is built on.
- The application URL (`app_user.[ref]`, transaction pooler, port 6543) is the only
  database credential that reaches Vercel.
- The service-role key is not set anywhere unless a specific admin task later needs
  it, and then only as a server-side environment variable.

## Consequences

- Phase 4 hosted setup can begin; it stays "in progress" until the hosted database
  has been migrated, `app_user` cannot bypass RLS, and the database test suite has
  passed against the hosted project.
- Verification order is fixed: migrate, then role, then `npm run test:db` against
  hosted, then one preview deployment, then the demo checks. A green local suite is
  not evidence about hosted configuration.
- The Free plan pauses after a week idle; a demo must be preceded by a check, or the
  project upgraded for the validation month.
- Rollback is project deletion on either service; the repository, local compose and
  CI are unaffected.

## Amendment: hosted setup, 2026-11-21

Setup began under this approval. Three things changed from the checklist wording:

- **API keys.** Supabase now issues publishable (`sb_publishable_…`) and secret
  (`sb_secret_…`) keys, and deprecates `anon` and `service_role` at the end of 2026. The project uses the publishable key in the browser and no secret key
  anywhere. The new keys are not JWTs and do not carry a role claim; the request
  path still sets `role` explicitly by running `SET LOCAL ROLE authenticated`, so
  Gate C's isolation contract is unchanged.
- **`APP_URL` without a domain.** No domain is being purchased before the pre-MVP.
  `APP_URL` is the free Vercel production alias (`https://<project>.vercel.app`),
  which is also the Supabase Auth Site URL; preview URLs are added to the redirect
  allowlist as needed. This is a naming choice, not a hosting commitment.
- **Database roles.** `postgres` is the migration role only (via `SUPABASE_DB_URL`,
  session pooler). `app_user` is created by `npm run db:app-role`, holds
  `noinherit` and membership of `authenticated`, and its URL carries
  `sslmode=no-verify` because the pooler's certificate chain is self-signed and
  `pg` 8.23 reads `require` as `verify-full`.

Compose Postgres remains the day-to-day database, as agreed; hosted exists for
review and demo checks.

### Verified on the hosted project

- Migrations: applied 4, second run applied 0 and tracked 4.
- Schema: 11 public tables, 24 policies, `private.is_member` and
  `private.has_role`, `product_stock` with `security_invoker=true`.
- `app_user`: login, no superuser, `rolbypassrls = false`.
- Isolation, as `app_user` with `SET LOCAL ROLE authenticated` and a stranger's
  claims: 0 rows from `businesses`, `products`, `product_stock`,
  `purchase_orders`.
- Writes: `stock_movements` insert `42501`, `purchase_receipts` insert `42501`,
  product insert into a business without membership `42501` (RLS), movement update
  `42501`.
- A direct `select` without `SET ROLE` is `42501`, so the grant layer holds even
  if the role switch were forgotten.
- Not yet verified hosted: the full `npm run test:db` suite, because it writes to
  `auth.users`; it runs against hosted once Phase 5 creates real users through
  Supabase Auth. Storage policy is also pending.
