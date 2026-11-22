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
| Dashboard figures are placeholders                                                              | low      | Labelled by slice; no invented numbers                                                       | No                                                    | Resolved 2026-11-22 (slice 8)                           |
| Sections other than Settings have no data                                                       | low      | Empty states say what arrives and when                                                       | No                                                    | Intentional                                             |
| Global search from the Direction C prototype is absent                                          | low      | Not rendered, rather than rendered dead                                                      | No                                                    | Deferred to the search slice                            |
| Rail abbreviates labels (Dash, Supp, POs) at 600px+                                             | low      | Full labels below 600px; screen readers hear the full name                                   | No                                                    | Review legibility during the layout review              |

## Auth slice (uncommitted) — 2026-11-21

| Limitation or risk                                                                                | Severity | Workaround                                                                                                             | Blocks demo?              | Status                      |
| ------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------- |
| A browser session rendering Demo Cafe for the linked account is unobserved                        | medium   | Sign in once at `http://localhost:25000` as `owner@cafe.test`; `withTenant` for that id already returns Demo Cafe only | Yes, for a signed-in demo | Awaiting one manual sign-in |
| Only one Supabase account is linked to local data                                                 | low      | `npm run db:link-user -- <uuid> <email>` links it to both demo businesses; pass `cafe` or `retail` to limit it         | No                        | By design for local dev     |
| Seed fixture emails use reserved `.invalid` addresses                                             | low      | They exist only to satisfy identity foreign keys; no sign-in uses them                                                 | No                        | Intentional (2026-11-22)    |
| Local `auth.users` is a two-column shim, not Supabase Auth                                        | medium   | Identity comes from Supabase; `db:link-user` only links the id to local demo data and refuses non-loopback databases   | No                        | By design for local dev     |
| Auth redirect allowlist was unconfirmed                                                           | medium   | Confirmed 2026-11-22: `http://localhost:25000/**` and `https://inventory-stage.vercel.app/**` are in Supabase          | No                        | Confirmed 2026-11-22 (user) |
| Vercel `DATABASE_URL_APP` points at hosted `app_user`, while `.env.local` points at the local one | medium   | Same name, per-environment value; never copy the local value into Vercel                                               | No                        | Documented                  |

## Slice 4 (products) — 2026-11-22

| Limitation or risk                                                   | Severity | Workaround                                                                             | Blocks demo? | Status              |
| -------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------- | ------------ | ------------------- |
| Product screens verified once, at desktop width only                 | low      | Walked through signed in as the cafe owner; narrow widths and touch targets unchecked  | No           | Verified 2026-11-22 |
| Purchase order history on a supplier or product is absent            | low      | The panels say it arrives with the purchase orders slice                               | No           | Until slice 7       |
| On-hand only changes through the seed's opening balances             | high     | Resolved by slice 6: stock in, stock out and reasoned adjustments append to the ledger | No           | Resolved 2026-11-22 |
| No product images                                                    | low      | `image_path` exists in the schema; upload arrives in slice 10                          | No           | Deferred            |
| Direction C keyboard shortcuts (`/` search, `Esc` close) are absent  | low      | Every control is a visible link, button or form                                        | No           | Deferred            |
| Below 900 px the panel sits above the list rather than overlaying it | low      | The close control is visible; no scrim or focus trap to get wrong                      | No           | Simplification      |
| The hosted stage had no catalogue                                    | high     | Resolved 2026-11-22 by `db:seed:hosted`; the stage carries the seeded baseline         | No           | Resolved 2026-11-22 |

## Slice 5 (suppliers) — 2026-11-22

| Limitation or risk                                    | Severity | Workaround                                                                                                      | Blocks demo? | Status              |
| ----------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- | ------------ | ------------------- |
| Supplier screens verified once, at desktop width only | low      | Walked through signed in as the cafe owner; narrow widths and touch targets unchecked                           | No           | Verified 2026-11-22 |
| Suppliers can be archived but not deleted             | low      | Archive keeps every product and, later, order link intact; deleting a supplier that is owed money is not wanted | No           | By design           |
| The supplier list has no pagination                   | low      | A cafe has nine suppliers and the retail demo six; revisit when a business holds hundreds                       | No           | Deferred            |
| Contact fields are free text except email             | low      | Phone and address formats vary by business; only the email is validated because it is copied into a mail client | No           | By design           |
| Products supplied shows the first 25 lines            | low      | The count sits in the header and a note appears when the list is capped                                         | No           | Intentional         |

## Slice 6 (stock ledger and inventory) — 2026-11-22

| Limitation or risk                                          | Severity | Workaround                                                                                                      | Blocks demo? | Status              |
| ----------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- | ------------ | ------------------- |
| Inventory screens verified once, at desktop width only      | low      | Walked through signed in as the cafe owner; narrow widths and touch targets unchecked                           | No           | Verified 2026-11-22 |
| Stock only arrives by manual movement until receiving lands | medium   | Resolved by slice 7: transactional receiving writes the ledger from the order lines                             | No           | Resolved 2026-11-22 |
| Viewers can see cost and stock value                        | medium   | The database refuses their movements and the schema allows owner/staff only, but screens are not role-aware yet | No           | Deferred            |
| Movement history shows the last 12 lines per product        | low      | Enough to explain the current position; there is no full ledger page                                            | No           | Intentional         |
| Movement dates use the server's timezone                    | low      | Local development and the demo run on one machine; a per-business timezone is not modelled                      | No           | Deferred            |
| Archived products are hidden from the inventory list        | low      | Restore the product on its catalogue page to adjust its stock again                                             | No           | By design           |
| No stock-take workflow that sets a counted quantity         | low      | A reasoned adjustment in or out reaches the same figure in two steps                                            | No           | Deferred            |
| A product at zero with no movements shows an empty history  | low      | The panel says no movements yet; the opening balance is only written when the seed has stock to record          | No           | Intentional         |

## Slice 7 (purchase orders and receiving) — 2026-11-22

| Limitation or risk                                               | Severity | Workaround                                                                                                                          | Blocks demo? | Status              |
| ---------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------- |
| Order and receiving screens verified once, at desktop width only | low      | Walked through signed in as the cafe owner; narrow widths and touch targets unchecked                                               | No           | Verified 2026-11-22 |
| A wrong receipt cannot be undone in the app                      | medium   | The ledger is append-only, so the correction is a reasoned adjustment by the quantity that arrived wrongly; that workflow is manual | No           | Deferred            |
| Only one open order per supplier                                 | low      | Gate A rule: add the extra quantities to the open order, or receive/cancel it before drafting another                               | No           | By design           |
| Over-receipt is refused, not clamped                             | low      | The form is pre-filled to the outstanding quantity; the error names what is still due                                               | No           | By design           |
| Receipts keep the ordered unit cost                              | medium   | A price change at delivery is not captured; the order line's cost is the value used for stock and the receipt                       | No           | Deferred            |
| No receipt document, print view or supplier confirmation         | low      | The panel lists each delivery with its date and line count                                                                          | No           | Deferred            |
| A draft cannot be edited once marked ordered                     | low      | Cancel and re-draft, or record the difference as an adjustment after receiving                                                      | No           | By design           |
| Changing a draft's supplier clears its lines                     | low      | Products belong to one supplier, so the old lines would not be valid under the new one                                              | No           | Intentional         |
| A rejected quantity resets to the outstanding default            | low      | The error states the outstanding quantity and the field is pre-filled with it                                                       | No           | Intentional         |
| Viewers can see order values and costs                           | medium   | The database refuses viewer writes; screens are not role-aware yet                                                                  | No           | Deferred            |

## Slice 8 (dashboard) — 2026-11-22

| Limitation or risk                                          | Severity | Workaround                                                                                                      | Blocks demo? | Status              |
| ----------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- | ------------ | ------------------- |
| Dashboard verified once, at desktop width only              | low      | Walked through signed in as the cafe owner; narrow widths and touch targets unchecked                           | No           | Verified 2026-11-22 |
| Figures are recomputed on every request, with no cache      | low      | Three reads over 220 products take milliseconds; a far larger catalogue would need materialised summaries       | No           | By design           |
| Needs attention lists the eight most urgent products        | low      | The header carries the full count and links to inventory; a complete low-stock report is slice 9                | No           | Intentional         |
| Stock value uses cost price, never retail price             | low      | Valuing at a selling price belongs to the reports slice                                                         | No           | Deferred            |
| Only the cafe account's dashboard was walked through        | low      | Every query filters by the active business id and isolation is covered by database tests; retail figures unseen | No           | Verified 2026-11-22 |
| Recent movements show the last eight lines for the business | low      | The inventory panel shows the last twelve per product; there is no full ledger page                             | No           | Intentional         |

## Slice 9 (reports and CSV export) — 2026-11-22

| Limitation or risk                                                     | Severity | Workaround                                                                                                | Blocks demo? | Status              |
| ---------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------- | ------------ | ------------------- |
| Report screens verified once, at desktop width only                    | low      | Walked through signed in as the cafe owner; narrow widths and touch targets unchecked                     | No           | Verified 2026-11-22 |
| An export builds the whole result set in memory before responding      | low      | 220 products and 219 movements are trivial; a far larger business would need streaming or chunked exports | No           | By design           |
| Movement date filters compare against the server's timezone            | low      | Local development and the demo share one machine; a per-business timezone is not modelled                 | No           | Deferred            |
| Valuation uses cost price, not selling price                           | low      | A retail valuation needs a decision about which price to use; the cost report is unambiguous              | No           | Deferred            |
| CSV import is not built                                                | low      | Product requirements list import as P2; no decision has been taken to build it                            | No           | Out of scope        |
| CSV text cells starting `=`, `+`, `-` or `@` gain a leading apostrophe | low      | Keeps a spreadsheet from running a product name as a formula; quantities and money stay numeric           | No           | By design           |
| A movement's reference names the type, not the receipt                 | low      | There is no receipt page to link to; the order panel lists each delivery with its date and line count     | No           | Intentional         |
| Only the cafe account's reports were walked through                    | low      | Every query filters by the active business, and tenant isolation is covered by the database tests         | No           | Verified 2026-11-22 |

## Slice 2 (demo reset) — 2026-11-22

| Limitation or risk                                                               | Severity | Workaround                                                                                                              | Blocks demo? | Status              |
| -------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------- |
| Reset deletes the business's products, orders, receipts and ledger, with no undo | high     | It exists for demo data only; anything worth keeping belongs in another business, and the restored baseline is the seed | No           | By design           |
| Reset restores the bundled baseline, not the state before the reset              | medium   | The payload comes from `db/seed-demo.ts`; a customised demo is rebuilt from the catalogue, not snapshotted              | No           | By design           |
| A reset is not audited                                                           | low      | The action is owner-only, typed-confirmed and logged by the server on failure; no `reset_history` table exists          | No           | Deferred            |
| The reset function writes opening movements and order status directly            | medium   | It is `SECURITY DEFINER`, owner-checked and payload-bounded; the ordinary app role still cannot write either            | No           | By design           |
| Business name, type, currency and memberships are not part of a reset            | low      | They are fixed for the prototype; a rename is a profile edit, not demo data                                             | No           | Intentional         |
| Only the cafe reset was walked through in a browser                              | low      | The retail payload is unit tested and the function's tests use their own fixtures                                       | No           | Verified 2026-11-22 |
| Staff and viewers do not see the panel                                           | low      | The screen checks the membership role and the database refuses them anyway; neither can reach the action                | No           | By design           |

## Phase 6a (responsive pass and viewer visibility) — 2026-11-22

| Limitation or risk                                                           | Severity | Workaround                                                                                                               | Blocks demo? | Status              |
| ---------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ | ------------ | ------------------- |
| The overlay panel has no focus trap, Escape or focus return below 900px      | low      | The scrim and the Close control are links that cancel the URL state; a trap would need the panel to be a client dialog   | No           | By design           |
| At 390px an open panel covers the sticky header                              | low      | The top nav bar stays visible; closing the panel restores the header, which is a normal phone bottom-sheet trade-off     | No           | By design           |
| The phone top nav scrolls horizontally                                       | low      | Seven destinations do not fit 390px; the last two need a sideways swipe, and labels no longer overlap                    | No           | By design           |
| Viewer masking happens at render, not in the query layer                     | low      | The report and list queries still read cost/value and the components omit them; exports are refused server-side with 403 | No           | Acceptable for demo |
| Viewer mode was checked by temporarily changing the owner's role in Postgres | low      | Only `owner@cafe.test` is linked; the role was restored to `owner` afterwards and both states were walked through        | No           | Verified 2026-11-22 |
| Reports export controls are hidden for viewers, not disabled                 | low      | The route refuses viewers with 403 whether or not the control is on screen                                               | No           | By design           |

## Phase 6 journey pass (product, supplier, stock, purchasing) — 2026-11-22

| Limitation or risk                                                                                           | Severity | Workaround                                                                                                                                                                           | Blocks demo? | Status              |
| ------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------------------- |
| A product or supplier form blanked every field when the server rejected a save (D1)                          | medium   | Fixed in `0ef1b41`: both forms hold their fields in state, so a duplicate SKU or an over-long name keeps the input; a jsdom test fails on the old code                               | No           | Fixed 2026-11-22    |
| The stock movement select showed "Stock in" after a rejected adjustment (D2)                                 | medium   | Fixed in `b368be9`: React's post-action form reset rewinds a select's DOM value, so the held type and direction are re-applied; a jsdom test covers it                               | No           | Fixed 2026-11-22    |
| A stale "saved" notice stays on screen through archive and restore (D3)                                      | low      | Fixed in `1219908`: archive and restore clear the one-shot `saved` URL flag after the action; four jsdom tests cover archive, restore and the no-op case                             | No           | Fixed 2026-11-22    |
| The journey pass left its test rows in the local database                                                    | low      | Settings → Demo data restores the seeded baseline; the rows (Journey Apples, Journey Produce Co, PO-0003) exist to inspect the pass                                                  | No           | By design           |
| A purchase order was created on a newly made supplier instead of Fresh Fields                                | low      | The one-open-order rule refused a second Fresh Fields order; the product's supplier was reassigned to the new supplier to exercise the journey                                       | No           | By design           |
| Some journey clicks were driven from the DOM because the automated tab is `document.visibilityState: hidden` | low      | The same controls were exercised by scripted clicks and `.click()`; real-mouse behaviour on Add line and Archive was not re-tested                                                   | No           | Verified 2026-11-22 |
| Tenant isolation was walked with a temporary Demo Retail membership                                          | low      | The linked account belongs to Demo Cafe only; foreign ids were refused without it first, then a retail membership was added for the switch and deleted                               | No           | Verified 2026-11-22 |
| Demo Retail has no purchase orders, so a foreign order id exists in one direction only                       | low      | The cafe order was tried while Demo Retail was active; the reverse direction has no retail order to try                                                                              | No           | Verified 2026-11-22 |
| An unknown route shows Next's default unstyled 404, outside the app shell                                    | low      | Fixed in the not-found commit: `src/app/not-found.tsx` renders a styled 404 with links to the dashboard and products; it has no rail because there may be no session                 | No           | Fixed 2026-11-22    |
| A database outage shows Next's generic error page, not the app's error panel                                 | medium   | Fixed 2026-11-22: `src/app/error.tsx` sits above `(app)/layout.tsx` and renders the shared `ErrorPanel`; checked by stopping Postgres, which showed the panel instead of Next's page | No           | Fixed 2026-11-22    |
| Try again after a page-level error was not seen to recover without a reload                                  | low      | The control is wired to the boundary's reset; the automated tab pauses the streamed reveal, so the check was inconclusive (a reload recovered)                                       | No           | Unverified          |
| Try again did not recover after Postgres restarted; a reload did                                             | low      | The retry hit the same connection error from the pool's stale connections, then a reload read 62 products; not fixed, and no retry-on-reconnect logic exists                         | No           | Open                |

## Demo walkthrough dry run (fresh baseline) — 2026-11-22

| Limitation or risk                                     | Severity | Workaround                                                                                                                                | Blocks demo? | Status                                 |
| ------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------- |
| Walkthrough is local-only HTML, verified without gates | low      | `local/` is prettier-ignored; present from a reset local database per Stop 0; no app code changed                                         | No           | Approved 2026-11-22; demo to be hosted |
| Supplier panel shows no order history                  | low      | The panel reads “Purchase order history arrives with the purchase orders slice”; the walkthrough now points PO-0001 at `/purchase-orders` | No           | Walkthrough corrected                  |
| Product panel carries no ledger lines                  | low      | On-hand/reorder/cost/category/supplier only; the 12-line history is inventory-only                                                        | No           | Walkthrough corrected                  |

Note: the 62-product reload above included leftover Journey rows; the fresh-baseline dry run re-confirmed a reload returns the 60-product baseline.

Deployment verification is complete, as reported by the user on 2026-11-22: the
redirect allowlist entries are in Supabase, `main` was pushed and the stage
deployed, and a signed-in stage re-check returned 60 products / 9 suppliers /
1 out / 1 low / $4,505.30 at cost / 1 open order / $131.80 on order. The hosted
data path is `db:seed:hosted` (verified 2026-11-22: 2 businesses, 2 memberships,
220 products, 219 movements, 2 orders with script-identical baseline figures).

## Local environment — 2026-11-22

| Limitation or risk                                                                   | Severity | Workaround                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Blocks demo? | Status           |
| ------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------------- |
| Recreating schema `public` strips its `USAGE` grant, so `test:db` fails with `42P01` | medium   | Wiping schema `public` in PostgreSQL 17 leaves it owned by `app` with an owner-only ACL, so `authenticated` had no `USAGE`: 31 of 44 database tests failed with `relation "products" does not exist`, and the app would have failed the same way. `0007_public_schema_usage.sql` now grants it in a committed migration. Proved on a wiped schema: after dropping `public` and `drizzle`, `db:migrate` applied 8 migrations and set the ACL to `{app=UC/app,authenticated=U/app}`, `test:db` passed 44/44 with no manual grant, and a second `db:migrate` applied 0. Hosted Supabase still needs `db:migrate:hosted` to record `0007`; its grants are already present | No           | Fixed 2026-11-22 |
