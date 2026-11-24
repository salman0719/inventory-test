# 0013 Approval can attach to an existing business

- **Date:** 2026-11-24
- **Status:** Accepted for the pre-MVP; implementation in `0011_approval_attach_business.sql`
- **Context:** `0012` DR2 made approval mean "create a business and make the applicant its
  owner", because that was the only case in the queue. It is not the only real case. A
  manager joining a café that is already a customer, a new owner after a sale, and a
  person who registered twice with two addresses all arrived through the same form, and
  approving them produced a second business with an empty catalogue — two stock
  ledgers for one shop, and neither party able to see the other's data. The reviewer
  also had no way to notice: the detail screen showed the requested name and nothing
  else. Separately, the product intends to bring staff members against a business, so
  memberships other than `owner` have to be creatable by someone.

## Decisions

- **DR1 — Approval takes an optional target.**
  `private.approve_signup_request(request_id, business_id default null, role default
'owner')`. With no target it behaves exactly as before: one new business, the
  applicant is its owner. With a target it creates no business and inserts a
  `business_members` row instead. Defaults keep every existing one-argument call
  working, so the SQL-editor path from `0012` is unchanged.

- **DR2 — The reviewer may grant `staff` or `viewer`, never `owner`.**
  The queue is a place to let a colleague in, not a place to hand over someone else's
  books. `owner` on an existing business raises `22023` with a sentence saying so; an
  ownership change stays an out-of-band operation. The SQL editor (the owner role) can
  still do it deliberately, which is the documented manual path.

- **DR3 — Duplicates are suggested, never merged.**
  `private.match_businesses(name)` compares names after normalising case, punctuation
  and the words "the"/"and", so "Bean & Gone", "Bean and Gone" and "The Bean Gone" are
  one candidate. It returns identity and counts only — name, type, age, member count,
  owner email — never the catalogue. Approving creates nothing automatically and
  nothing merges two businesses: the reviewer reads the candidate, decides whether the
  claim is right, and either attaches or approves a new business.

- **DR4 — The decision is still one transaction.**
  The same function locks the request, refuses a rejected one, refuses a missing target
  business, and writes status, `business_id`, `decided_by` and `decided_at` together
  with the membership. Repeating it replays the approval instead of adding a second
  membership, and an existing member keeps the role they already hold (`on conflict do
nothing`) — an owner is never demoted by a second click.

- **DR5 — Staff memberships are a role, not yet a screen.**
  The database, RLS and the app's business switcher already handle a user with several
  memberships, so an attached staff member works without new tenant plumbing. Managing
  members afterwards — inviting, changing a role, removing someone — is deliberately
  not built: it needs its own rules and, for invites, a mail provider (D2).

## Consequences

- Hosted needs `0011` applied; the panel's attach forms call the three-argument
  function, so an unmigrated stage would fail those clicks rather than fall back.
- The duplicate hint is on the registration detail screen only. The queue list does not
  flag a likely duplicate, so a reviewer must open the row (they already must, to act).
- A name typed quite differently ("Bean & Gone" vs "BeanGone Coffee") will not match;
  the search box is the fallback, and it is a name search over every business.
- Attaching gives the account access to that business's data immediately, with the
  role's existing permissions — `staff` is not a read-only role. A reviewer who is not
  sure the claim is right should reject rather than attach.
- There is no way to detach someone from the panel. Removal is a `business_members`
  delete by hand until member management exists.
- `docs/known-limitations.md` records the unverified click-through: the forms were
  typechecked and their functions covered by database tests, but no attach has been
  clicked in a browser.
