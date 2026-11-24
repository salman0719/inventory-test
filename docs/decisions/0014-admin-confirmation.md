# 0014 A reviewer can confirm an address

- **Date:** 2026-11-24
- **Status:** Accepted for the pre-MVP; implementation in `0012_account_confirmation.sql`
- **Context:** Approval needs a `signup_requests` row, and with email confirmation on
  that row is written only by `/auth/confirm`. So an applicant whose confirmation email
  never arrived was unreachable: they could not sign in (`email_not_confirmed`), no
  request existed to approve, and the panel could only report "address not confirmed" —
  it does not hold the service-role key, and `authenticated` has no privilege on `auth`.
  The mailer makes this common rather than rare: two messages an hour for the whole
  project, and delivery only to team addresses until SMTP exists (D2).

## Decisions

- **DR1 — Confirming is a panel action, not a SQL errand.**
  `private.confirm_account(user_id)` sets `auth.users.email_confirmed_at`, SECURITY
  DEFINER behind the same `is_platform_admin()` guard as every other panel call. It is
  the only write the panel makes outside `signup_requests`.

- **DR2 — The registration is filed in the same transaction.**
  The answers come from the metadata the registration form stored on the user
  (`full_name`, `business_name`, `business_type`), are validated in SQL rather than
  trusted, and are inserted with `on conflict (user_id) do nothing`. Filing is not
  optional convenience: confirming alone would leave the account able to sign in and
  still unable to be approved. An account with no answers — invited, or created in the
  dashboard — is confirmed and reports that nothing was filed; answers that are present
  but unusable are refused with `22023` so the reviewer does not believe something
  happened that did not.

- **DR3 — Confirming does not approve.**
  The filed request is `pending`. Approval, attachment and rejection stay separate
  decisions on the registrations screen, with their own ids and their own transaction.

- **DR4 — "Confirmed" now means vouched for, not proved.**
  The email link remains the normal path and the one the product prefers; this is the
  manual path when that link cannot arrive. The trade is explicit: an admin can confirm
  an address they do not control. For a product where a person already vets every
  business, that is acceptable, but the two meanings must not be conflated in copy or in
  reporting.

- **DR5 — Resending the link is not built.**
  `supabase.auth.resend` needs no service key and would be the honest alternative, but
  it is capped by the same built-in mailer, so it becomes worth shipping when a mail
  provider is chosen (D2). Until then a reviewer has one tool, not two.

## Consequences

- Hosted needs `0012` applied before the button works; the page calls the function
  directly, so an unmigrated stage fails the click rather than degrading.
- Nothing records **who** confirmed an address. `auth.users` has no place for it and the
  request row does not carry it, so an audit trail needs its own table — the same gap
  that already exists for role changes.
- A confirmed account that never filed answers sits on the app's "no business" screen
  with nothing for the reviewer to approve; that is honest, and the accounts screen says
  "registration never filed" next to it.
- An account confirmed this way can still be rejected afterwards like any other; the
  rejection note reaches the wait screen because a request now exists.
