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
