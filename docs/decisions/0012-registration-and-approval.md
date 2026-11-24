# 0012 Registration with manual approval

- **Date:** 2026-11-24
- **Status:** Accepted for the pre-MVP, pending review
- **Context:** The product needs self-service registration, and every business must be
  checked by a person before it opens. The architecture's auth list had no
  registration at all, and accounts were created by hand in Supabase. There is no
  service-role key in the project (0008 DD5), so neither the app nor an admin panel
  may use one.

## Decisions

- **DR1 — Registration creates a request, never a business.**
  `signup_requests` is written after the address is confirmed, from metadata the
  registration form stored on the auth user. A business exists only after approval,
  so an unapproved account that signs in has nothing to reach.

- **DR2 — Approval is one SECURITY DEFINER function.**
  `private.approve_signup_request` creates the business, makes the applicant its owner
  and marks the request approved in one transaction. It refuses a rejected request and
  returns the existing business if repeated. `private.reject_signup_request` writes the
  status and the note the applicant reads.

- **DR3 — Callers are the admin list or the owner role.**
  Any application role must be on `platform_admins`; the check is
  `private.is_platform_admin()`, read through the `role` GUC because `current_user`
  inside a SECURITY DEFINER function is the function's owner. The table owner (the
  SQL editor) is the manual path until the panel ships.

- **DR4 — An applicant may file and read, nothing else.**
  `signup_requests_insert` pins `user_id = auth.uid()`, `status = 'pending'` and a null
  business and decision, so a crafted request cannot approve itself. There is no
  applicant UPDATE policy.

- **DR5 — The application requires a business, not just a session.**
  `(app)/layout.tsx` sends a signed-in account with no membership to
  `/awaiting-approval`, outside the route group so the redirect cannot loop.

- **DR6 — No service-role key for the admin panel.**
  Each panel question becomes a narrowly shaped SECURITY DEFINER function that checks
  the admin list. The prototype is `local/prototypes/registration/registration.html`;
  the phases are in `docs/plans/registration-and-admin.md` §5.

- **DR7 — Confirmation accepts both link shapes.**
  `/auth/confirm` handles a PKCE `code` and a `token_hash` + `type`, so the default
  Supabase templates work unchanged and the same route will serve password recovery
  when it is built.

- **DR8 — SSO is deferred, Google first if it is ever asked for.**
  OAuth providers are included on every Supabase plan; SAML 2.0 needs Pro and its
  per-MAU add-on. Both need a "tell us about the business" step that writes the same
  request row, which is the real work. No SSO code is written now.

## Consequences

- Hosted needs `0008_signup_requests.sql` applied before the next deployment; the code
  reads the new tables.
- Approving by hand is a function call from the SQL editor, not edits to three tables.
- The first admin is inserted by hand; there is no way to grant admin from the app.
- A registration whose address is never confirmed never reaches the queue, and nothing
  notifies an admin that a request arrived.
- The database tests cover the boundary (self-approval, cross-account reads,
  idempotent approval, rejection); the inbox flow and a hosted run are still unverified.
