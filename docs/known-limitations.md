# Known Limitations and Risks

Record limitations honestly. Include severity, workaround, and whether the issue blocks customer demonstrations.

| Limitation or risk | Severity | Workaround | Blocks demo? | Status |
| ------------------ | -------- | ---------- | ------------ | ------ |
| Not yet assessed   |          |            |              |        |

## Recorded risks after Gate A

- **Cafe depth (high).** No recipes or POS depletion, so the cafe demo covers
  purchasing, receiving, wastage and count correction only. The walkthrough must
  state that rather than imply usage tracking.
- **Mobile receiving (medium).** Receiving and wastage happen on a phone; a
  desktop-only form fails the staff persona and the demo.
- **Partial receiving correctness (high).** Double-counting stock is the classic
  defect; receiving must be one atomic transaction with tests.
- **Single-PO model (low).** Users of split-PO tools may expect suffixed orders;
  outstanding quantities must be labelled plainly.
- **No validation yet (high).** Personas are hypotheses until Phase 7.

## Risks to actively monitor

- Stock ledger and cached quantity becoming inconsistent.
- Partial receiving creating duplicate stock movements.
- Cross-business data exposure due to missing or weak RLS.
- Demo reset deleting the wrong business data.
- UI controls that look functional but are not connected to real operations.
- Seed data that does not support a believable demonstration.
- Excessive scope expansion into ERP functionality.
- Third-party service costs or account changes made without approval.

## Slice 1 (app shell) — 2026-11-21

| Limitation or risk                                                                              | Severity | Workaround                                                                                   | Blocks demo?                                          | Status                                                  |
| ----------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------- |
| Shell reads the local **owner** connection, not `app_user`, because authentication is not built | high     | Local compose data only; hosted falls back to `DATABASE_URL_APP`                             | No for layout review; yes before any real tenant data | Temporary, replaced with the authenticated request path |
| Hosted stage shows no businesses                                                                | medium   | Expected: `app_user` has no `auth.uid()` claims, so RLS returns nothing until sign-in exists | No, the shell still renders                           | Until authentication                                    |
| Dashboard figures are placeholders                                                              | low      | Labelled by slice; no invented numbers                                                       | No                                                    | Until slice 8                                           |
| Sections other than Settings have no data                                                       | low      | Empty states say what arrives and when                                                       | No                                                    | Intentional                                             |
| Global search from the Direction C prototype is absent                                          | low      | Not rendered, rather than rendered dead                                                      | No                                                    | Deferred to the search slice                            |
| Rail abbreviates labels (Dash, Supp, POs) at 600px+                                             | low      | Full labels below 600px; screen readers hear the full name                                   | No                                                    | Review legibility during the layout review              |

## Auth slice (uncommitted) — 2026-11-21

| Limitation or risk                                                                                | Severity | Workaround                                                                                                             | Blocks demo?                             | Status                      |
| ------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------- |
| A browser session rendering Demo Cafe for the linked account is unobserved                        | medium   | Sign in once at `http://localhost:25000` as `owner@cafe.test`; `withTenant` for that id already returns Demo Cafe only | Yes, for a signed-in demo                | Awaiting one manual sign-in |
| Only one Supabase account is linked to local data                                                 | low      | `npm run db:link-user -- <uuid> <email> retail` links a second account to Demo Retail                                  | No                                       | By design for local dev     |
| Seed fixture emails use reserved `.invalid` addresses                                             | low      | They exist only to satisfy identity foreign keys; no sign-in uses them                                                 | No                                       | Intentional (2026-11-22)    |
| Local `auth.users` is a two-column shim, not Supabase Auth                                        | medium   | Identity comes from Supabase; `db:link-user` only links the id to local demo data and refuses non-loopback databases   | No                                       | By design for local dev     |
| Auth redirect allowlist not confirmed                                                             | medium   | Add `http://localhost:25000/**` and the stage origin in Supabase                                                       | No for local; yes for hosted email links | Pending                     |
| Vercel `DATABASE_URL_APP` points at hosted `app_user`, while `.env.local` points at the local one | medium   | Same name, per-environment value; never copy the local value into Vercel                                               | No                                       | Documented                  |

## Slice 4 (products) — 2026-11-22

| Limitation or risk                                                   | Severity | Workaround                                                                            | Blocks demo?                   | Status              |
| -------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------- | ------------------------------ | ------------------- |
| Product screens verified once, at desktop width only                 | low      | Walked through signed in as the cafe owner; narrow widths and touch targets unchecked | No                             | Verified 2026-11-22 |
| Purchase order history on a supplier or product is absent            | low      | The panels say it arrives with the purchase orders slice                              | No                             | Until slice 7       |
| On-hand only changes through the seed's opening balances             | high     | The figures are real ledger sums, but nothing adjusts or receives stock until slice 6 | No for a catalogue walkthrough | Until slice 6       |
| No product images                                                    | low      | `image_path` exists in the schema; upload arrives in slice 10                         | No                             | Deferred            |
| Direction C keyboard shortcuts (`/` search, `Esc` close) are absent  | low      | Every control is a visible link, button or form                                       | No                             | Deferred            |
| Below 900 px the panel sits above the list rather than overlaying it | low      | The close control is visible; no scrim or focus trap to get wrong                     | No                             | Simplification      |
| The hosted stage has no catalogue                                    | high     | `db:seed` refuses non-loopback databases, so demos run locally                        | Yes for a hosted demo          | Open decision       |

## Slice 5 (suppliers) — 2026-11-22

| Limitation or risk                                    | Severity | Workaround                                                                                                      | Blocks demo? | Status              |
| ----------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- | ------------ | ------------------- |
| Supplier screens verified once, at desktop width only | low      | Walked through signed in as the cafe owner; narrow widths and touch targets unchecked                           | No           | Verified 2026-11-22 |
| Suppliers can be archived but not deleted             | low      | Archive keeps every product and, later, order link intact; deleting a supplier that is owed money is not wanted | No           | By design           |
| The supplier list has no pagination                   | low      | A cafe has nine suppliers and the retail demo six; revisit when a business holds hundreds                       | No           | Deferred            |
| Contact fields are free text except email             | low      | Phone and address formats vary by business; only the email is validated because it is copied into a mail client | No           | By design           |
| Products supplied shows the first 25 lines            | low      | The count sits in the header and a note appears when the list is capped                                         | No           | Intentional         |
