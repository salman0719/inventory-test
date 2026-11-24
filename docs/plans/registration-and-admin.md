# Registration, approval and the admin panel

Status: draft for review, 2026-11-24. Phase 1 (registration and the approval gate) is
implemented and committed (`db32b9a`), and `0008` is applied to hosted Supabase. One
registration has been walked end to end on the stage (see
`docs/implementation-status.md`); the emailed link still returns to the Site URL
instead of `/auth/confirm`, which stays open in `docs/known-limitations.md`. The first
platform admin exists, so approval from the application is possible. Phases 2 and 3 are
built (`0009` and `0010` plus `/admin`), but both migrations and the build are local
only — the stage still has no panel until `npm run db:migrate:hosted` and a deploy ship.
The admin panel exists as a
prototype only: `local/prototypes/registration/registration.html` (untracked, one
self-contained file so the preview can serve it). This plan replaces the earlier
sign-in plan, which covered a different slice.

## 1. Where the product is, against the architecture's auth list

| Requirement (`docs/technical-architecture.md` §Authentication) | State                           | Where                                                             |
| -------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------- |
| Email/password sign-in                                         | Built                           | `src/app/(auth)/sign-in/actions.ts`                               |
| Logout                                                         | Built                           | `src/app/(app)/actions.ts` (`signOut`)                            |
| Password reset                                                 | **Missing**                     | no forgot/reset routes; `/auth/confirm` already accepts the token |
| Persistent sessions                                            | Built                           | `@supabase/ssr` cookies, refreshed in `src/proxy.ts`              |
| Protected application routes                                   | Built                           | `src/proxy.ts`                                                    |
| User-to-business membership                                    | Built                           | `src/lib/businesses.ts`, RLS                                      |
| Business selector                                              | Built                           | `src/lib/active-business.ts` (`pickBusiness`)                     |
| **Self-service registration**                                  | **Built this slice**            | `/register`, `/auth/confirm`, `src/lib/signup.ts`                 |
| **Approval before a business exists**                          | **Built this slice**            | `signup_requests`, `(app)/layout.tsx`, `/awaiting-approval`       |
| **Admin review and the panel**                                 | **Built locally, not deployed** | `0008`–`0011`, `/admin`, `src/lib/admin.ts`                       |

## 2. Registration, as built

```
/register  ──signUp──▶  Supabase Auth user (unconfirmed)
                          │  email link (code or token_hash)
                          ▼
                     /auth/confirm ──▶ signup_requests row (pending) ──▶ /
                          │
                          ├─ no membership ──▶ (app)/layout.tsx ──▶ /awaiting-approval
                          └─ admin approves ──▶ business + owner membership ──▶ dashboard
```

1. `src/app/(auth)/register/` — a 420px card collecting your name, business name,
   business type, email and password. Zod validates at the server boundary
   (`registerSchema` in `src/lib/signup.ts`); the form holds its fields in state so a
   rejected registration does not blank them.
2. `supabase.auth.signUp` with `emailRedirectTo: ${APP_URL}/auth/confirm` and the
   business answers in `options.data`. An address that already exists is answered
   exactly like a new one, because Supabase returns it with `identities: []`.
3. `src/app/auth/confirm/route.ts` accepts either a PKCE `code`
   (`exchangeCodeForSession`) or `token_hash` + `type` (`verifyOtp`), so the default
   Supabase email templates work without a dashboard change. It then writes the
   request row from the confirmed user's metadata and redirects to `/`.
4. `signup_requests` holds the application: applicant, requested business, status,
   the note an admin leaves on a rejection. It is platform-level — no `business_id` —
   because it exists to decide whether a business should exist at all.
5. `(app)/layout.tsx` requires a business, not just a session. A signed-in account
   with no membership is sent to `/awaiting-approval`, which is outside the group so
   the redirect cannot loop. This is what makes an unapproved account harmless: it
   cannot reach a screen, and RLS would return no rows even if it could.

RLS on the new tables:

| Policy                   | Rule                                                                          |
| ------------------------ | ----------------------------------------------------------------------------- |
| `signup_requests_select` | own row, or a platform admin                                                  |
| `signup_requests_insert` | `user_id = auth.uid()`, status `pending`, no business and no decision columns |
| `signup_requests_update` | platform admin only                                                           |
| `platform_admins_select` | platform admins only                                                          |

Approval is `private.approve_signup_request(request_id, business_id, role)`: SECURITY
DEFINER, so it can insert a business and a membership that the caller's own RLS would
refuse. It locks the request, refuses a rejected one, and then does one of two things
— with no business it creates one and makes the applicant its `owner`; with a business
it creates no business and adds a `staff` or `viewer` membership instead (`0011`,
`docs/decisions/0013-approval-attach-or-create.md`). Status, `business_id`, the
decision columns and the membership commit together. Repeating it returns the business
it already produced instead of making a second one, and someone who is already a
member keeps the role they hold. `owner` on an existing business is refused: the queue
lets a colleague in, it does not hand over a tenant. `private.reject_signup_request`
does the same for a rejection, with an optional note.

To make a duplicate visible before it is created, `private.match_businesses(name)`
returns existing businesses whose names match after ignoring case, punctuation and the
words "the"/"and" — identity and counts only. It suggests; the reviewer decides.

## 3. Approving by hand until the panel exists

There is no service-role key in this project, so approval is a function call, not a
row edit in three tables. From the Supabase SQL editor:

```sql
-- the queue
select id, created_at, full_name, email, business_name, business_type
  from public.signup_requests
 where status = 'pending'
 order by created_at;

-- approve one as a new business, applicant is owner
select private.approve_signup_request('<request-id>');

-- or let them into a business that already exists, as staff or viewer
select private.approve_signup_request('<request-id>', '<business-id>', 'staff');

-- which businesses look like the claim? (same matching the panel uses)
select * from private.match_businesses('Bean & Gone');

-- reject one, with the note the applicant will read
select private.reject_signup_request('<request-id>', 'We could not verify the business.');
```

The SQL editor connects as the table owner, which the functions allow. Any
application role must be on `platform_admins`: the function refuses a signed-in
caller who is not, including one that reached it with no session claim.

The first admin is inserted by hand:

```sql
insert into public.platform_admins (user_id)
select id from auth.users where email = 'ops@example.com';
```

## 4. What an unapproved user sees

`/awaiting-approval` reads only the applicant's own row and renders one of four
states: **pending** (requested date, account, "In review", what happens next),
**rejected** (the admin's note, no data was created), **approved** (a link into the
dashboard), or **no request** (an account that was never registered — with a link to
`/register`). Sign out is on every state, because an unapproved user has nowhere else
to go.

The screen is deliberately not a dead end: it says who will contact them and on which
address, and it never claims the account is open.

## 5. Admin panel

Prototype: `local/prototypes/registration/registration.html`. Sketched screens and
why they earn a place:

| Screen        | Content                                                                                                                                                                  | Phase |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| Overview      | Waiting-on-you tile, new this week, businesses, accounts; the queue oldest-first; where accounts stall (registered → confirmed → approved → signed in); recent decisions | 2     |
| Registrations | Status filter, search, list; a detail panel with the applicant's answers and Approve/Reject with a note                                                                  | 2     |
| Accounts      | Everyone with a sign-in, including the unapproved one, with business and role                                                                                            | 3     |
| Businesses    | Counts only — products, open orders, owner — never the tenant's catalogue                                                                                                | 3     |

Later, and deliberately not sketched as if they were ready: changing a role, inviting a
colleague, suspending an account, resending a confirmation email, and an audit trail
of who approved what. Each needs a rule about who may do it and what happens to the
business's data.

**How the panel reads data.** Not with a service key and not as a tenant. Every
question the panel asks crosses tenants, so each one becomes a narrowly shaped
SECURITY DEFINER function that checks `private.is_platform_admin()` and returns only
what the screen needs — `admin_overview()`, `list_signup_requests(status, search)`,
`list_accounts()`, `list_businesses()`. The alternative, granting the admin role broad
SELECT on every tenant table, would make one compromised admin session a full data
breach and would need policies the rest of the app never exercises.

`/admin` routes sit in their own group, outside `(app)`: an admin has no business, so
the app's layout gate would otherwise send them to `/awaiting-approval`. The proxy
stays the single gate for `signed-in`; the admin check is in the layout and in every
function, because a URL must not be the boundary.

The gate now knows the difference. A reviewer with no business is redirected to
`/admin` (`noBusinessDestination` in `src/lib/admin.ts`), the wait screen offers them
the queue rather than registration, and a reviewer who also owns a business — the
demo owner locally — gets an **Admin** link in the app header from 600px up. Before
this, nothing in the product pointed at `/admin`; it had to be typed.

Phases:

- **Phase 2 — built locally 2026-11-24, not deployed.** `/admin` layout (404 for a
  non-admin), overview, registrations with status filter and search, and a detail
  screen whose approve/reject forms call the two functions above. Reads come from
  `private.admin_overview`, `private.list_signup_requests` and
  `private.get_signup_request`, all admin-guarded in SQL. Acceptance: the queue's
  ordering and the filters are covered by `tests/db/admin-panel.test.ts`; approving in
  the panel calls the same function the SQL path does, so it produces the same
  business and membership, but the button itself has not been clicked in a browser yet
  (`docs/known-limitations.md`).
- **Phase 3 — built locally 2026-11-24, not deployed.** `/admin/accounts` (email,
  confirmed, joined, business, role, registration status) and `/admin/businesses`
  (active products, open orders, members, owner) read `private.list_accounts` and
  `private.list_businesses`. The business projection is counts only, and a test pins
  the returned column list so no catalogue, price or ledger column can creep in.
- **Phase 3.5 — attach instead of duplicating, built locally 2026-11-24, not deployed.**
  `0011` gives approval an optional target and lets a reviewer grant `staff`/`viewer`;
  the detail screen shows name-matched candidates with a role select and an attach
  button, changes the primary action to "Approve as a new business anyway" when they
  exist, and allows searching every business for a target that did not match. Covered
  by `tests/db/approval-attach.test.ts` (14 cases). Attaching never merges or moves any
  existing data, and nothing records a later removal: member management is still
  unbuilt.
- **Phase 3.6 — confirming an address, built locally 2026-11-24, not deployed.**
  `0012` adds `private.confirm_account(user_id)`, and `/admin/accounts` gains the one
  write that screen has: **Confirm address** on an unconfirmed row. It sets
  `email_confirmed_at` and files the registration from the sign-up metadata in one
  transaction, so the account is approvable rather than merely able to sign in; it
  does not approve anything. This is the manual answer to a lost confirmation email
  while the mailer is capped (D2); the link stays the normal path
  (`docs/decisions/0014-admin-confirmation.md`).
- **Phase 4:** notifications — an email to the admin when a request arrives, and one
  to the applicant when it is decided. This needs a mail provider (a spend decision,
  see §7 D2).

## 6. SSO: how hard, and which to do first

Supabase Auth already supports all three routes; the cost is configuration and
product decisions, not authentication code.

| Option                                            | What it takes                                                                                                                                                                                             | Effort (estimate)                                            | Cost                                                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Google OAuth ("Sign in with Google")              | Enable the provider in Supabase with a Google Cloud OAuth client, add `/auth/callback` (or reuse `/auth/confirm`) and a button. Google verification is not needed for a private app while under 100 users | ~half a day, plus the owner creating the Google Cloud client | Free on every Supabase plan                                                                           |
| Microsoft / Entra ID OAuth                        | Same shape, an Entra app registration instead of Google                                                                                                                                                   | ~half a day                                                  | Free                                                                                                  |
| SAML 2.0 SSO (Okta, Entra SAML, Google Workspace) | Configure one SAML connection per customer in Supabase, decide domain-based routing and how a first-time SSO user is approved                                                                             | 2–3 days for the first customer, plus support per customer   | Supabase Pro ($25/month) and above; SAML/SSO is an add-on with 50 users included, then $0.015 per MAU |

Two consequences specific to this product:

- **An SSO user has no business answers.** Google returns a name and an email, not a
  business name and type. A first sign-in therefore has to land on a short
  "tell us about the business" step that writes the same `signup_requests` row, and
  the same admin approval follows. That step is the real work, not the provider.
- **Account linking.** A person who registered with a password and later uses Google
  with the same address should become one account, not two. Supabase links identities
  only when it can verify the address; the rule needs to be written down before the
  button ships.

Recommendation: **email/password + approval first** (already built), then **Google
OAuth** if the first real users ask for it — it is the one café and retail owners
already have, and it removes "another password" from a form they fill once. Do not
build SAML before a customer with an identity provider asks: it costs a plan upgrade,
it is per-customer configuration, and this product's buyer is a single-site owner, not
an IT department. Microsoft only if retail chains appear in validation.

Everything above is out of scope until the approval flow has been walked end to end
with a real inbox.

## 7. Decisions needed

- **D1 — Who is an admin? — closed 2026-11-24.** The reviewer is a separate ops
  account, `codemen.salman+stkadmin@gmail.com`, so the reviewer is not also a tenant.
  The address had no `auth.users` row, so the account was created in the dashboard
  first (no email sent, no sign-up request filed) and the row inserted at 09:19Z. The
  guard was checked as that identity, not just by reading the table: true for the
  admin, false for an applicant. `platform_admins` remains hand-maintained by design.
- **D2 — Email — measured 2026-11-24.** Registration depends on Supabase's built-in
  mailer, and its limits are now measured rather than assumed: two messages an hour
  for the whole project, shared by every environment pointed at it, and delivery only
  to the organisation's own team addresses until custom SMTP is configured. A direct
  probe of `POST /auth/v1/signup` returned 200 while the form still showed a
  rate-limit message — which is how the reset was found and the copy was found to be
  wrong. Custom SMTP (Resend, SES, Postmark) is the fix and starts at 30 an hour; the
  provider and the bill are still open, and Phase 4 notifications need the same
  decision.
- **D3 — Password policy — closed 2026-11-24.** The form enforces 8–72 characters and
  Supabase's minimum is now 8, set in the dashboard, so the server no longer refuses
  what the form accepts.
- **D4 — What approval means — answered 2026-11-24.** Approval no longer always
  creates a business. If the requested name resembles an existing business the
  reviewer is shown the candidates, and if the claim is right the applicant is attached
  to it as `staff` or `viewer` instead; a new business stays the default and the
  fallback. Staff members against a business are confirmed as a planned capability,
  which is why the attachment is a real `business_members` row rather than a flag.
  Built in `0011` and `docs/decisions/0013-approval-attach-or-create.md`; what is still
  unbuilt is managing members afterwards (invite, change role, remove).
- **D6 — What an unconfirmed account can do — answered 2026-11-24.** A reviewer can
  vouch for an address from Accounts, which confirms it and files the registration the
  sign-up form supplied; approval remains a separate decision. "Confirmed" therefore
  means "a reviewer vouched", not "the inbox was proved", and resending the link waits
  for a mail provider (D2).
- **D5 — Rejection follow-up.** A rejected applicant can read the note and sign out,
  but cannot re-apply from the UI (their row is unique per account). Is one round of
  email correspondence enough for the pre-MVP?

## 8. Risks

- **Hosted was not migrated — resolved 2026-11-24.** `0008_signup_requests.sql` ran on
  the hosted project (`applied 1 migration(s), 9 tracked in total`) and a read-only
  check found both tables with RLS on, the three `private` functions as SECURITY
  DEFINER and the four policies. The deploy no longer breaks on `/awaiting-approval`.
  `platform_admins` now holds the reviewer account, so an application role can approve.
- **Confirmation is a second inbox.** A registration that never confirms never
  reaches the queue — the biggest silent drop-off, and the reason the funnel is worth
  showing an admin.
- **The redirect allowlist.** `/auth/confirm` is under the already-confirmed origins
  (`localhost:25000/**`, `inventory-stage.vercel.app/**`), so no new entry is needed;
  add one for any new origin or the link lands on Supabase's error page. Both entries
  are present yet a stage link still returned to the Site URL on 2026-11-24, so the
  remaining variable is `APP_URL` on Vercel: it must be the production alias exactly,
  because Supabase substitutes the Site URL for any redirect it will not allow.
- **No audit trail.** `decided_by` and `decided_at` are recorded, but nothing records
  a reversal or an admin's other actions.
- **The gate adds a query to every app render.** `(app)/layout.tsx` now awaits
  `getActiveBusiness` before the shell streams. It is the same request-cached query the
  shell already ran, but it is no longer behind its own Suspense boundary. If that
  shows up in navigation timing, the gate belongs in the shell's content slot instead.
- **Nothing was tested with a real inbox or a real Google account.** Verification
  below is explicit about that.

## 9. Verification and effort

Run before calling this done: `npm run check`, `npm run test`, `npm run build`,
`npm run secrets:check`, `npm run test:db` (needs the local database). Then walk, by
hand, in a browser: register with a fresh address, open the link from the inbox,
see the pending screen, approve by SQL, reload and reach the dashboard. Repeat the
approval from the panel once Phase 2 exists, and check that a second account sees no
part of the first.

Effort so far: registration and the gate about a day, including the migration and the
database tests. Phase 2 (admin overview and queue) is about a day; Phase 3 half a day;
Phase 4 depends on D2.
