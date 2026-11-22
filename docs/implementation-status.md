# Implementation Status

Keep this file current. Do not report a task as complete until it has been verified.

## Overall status

- Current phase: Phase 5. Slices 1 and 3–9 are committed — shell/selector,
  Supabase Auth with the authenticated `app_user` request path, products and
  categories, suppliers, the stock ledger with inventory screens, purchase orders
  with transactional receiving, the dashboard, and reports with CSV export. The
  Supabase account `owner@cafe.test` is linked to the local Demo Cafe, so signing in
  with it renders real catalogue data. Slice 2 (the demo reset workflow) is
  committed as `906a7c2`; every Phase 5 slice is now built apart from product
  images and CSV import
- Current deployment: Vercel stage at `https://inventory-stage.vercel.app`
  (public, no deployment protection; it serves the committed shell, not slices 1
  and 3)
- Last updated: 2026-11-22

## Phase checklist

### Phase 0: Repository discovery

- [x] Repository inspected
- [x] Existing conventions documented
- [x] Risks and assumptions listed (see `docs/plans/phase-0-assessment.md`)

### Phase 1: Product research

- [x] Public sources reviewed
- [x] Research log completed
- [x] Requirements prioritised
- [x] Navigation and journeys proposed
- [x] Gate A approved

### Phase 2: Design exploration

- [x] Direction A interactive prototype
- [x] Direction B interactive prototype
- [x] Direction C interactive prototype
- [x] Comparison and recommendation
- [x] Gate B approved

### Phase 3: Architecture

- [x] Architecture reviewed
- [x] Schema reviewed
- [x] RLS plan reviewed
- [x] Stock transaction design reviewed
- [x] Gate C approved

### Phase 4: Infrastructure

- [x] GitHub setup (repository and CI)
- [x] Migrations, seed and CI migration gate (local Postgres only)
- [x] Database integration tests in CI (tenant isolation, ledger writes)
- [x] Supabase project setup (Free, Sydney; four migrations applied; `app_user` created)
- [x] Auth configured (Supabase Auth via `@supabase/ssr`; one account linked to
      local demo data)
- [ ] Storage configured (bucket created; tenant policy pending)
- [x] Vercel configured (deployed at `https://inventory-stage.vercel.app`; env vars imported, not yet read by app code)
- [x] Gate D approved

### Phase 5: Implementation

- [x] App shell and navigation (local only, uncommitted pending review)
- [x] Business selector (local only; cookie-based, pre-authentication)
- [x] Authentication (built and linked; one manual browser sign-in pending)
- [x] Products and categories (committed `c765db0`; walked through in a browser)
- [x] Suppliers (committed `cd8361d`; walked through in a browser)
- [x] Stock ledger (committed `872555d`; `private.record_stock_movement`)
- [x] Inventory screens (committed `872555d`; walked through in a browser)
- [x] Purchase orders (committed `5691948`; drafts, ordering, cancelling)
- [x] Partial receiving (committed `5691948`; `private.receive_purchase_order`)
- [x] Dashboard (committed `0291bad`; live figures, needs attention, movements)
- [x] Reports (committed `d2d0149`; stock, low stock, movements, order status, valuation)
- [x] CSV export (committed `d2d0149`; every report, filters respected)
- [ ] CSV import (P2: not started, no decision to build it)
- [ ] Image upload
- [x] Seed and reset (committed `906a7c2`; `private.reset_demo_business` and the Settings panel)

### Phase 6: Validation

- [ ] Core journeys tested
- [ ] Partial receiving tested
- [ ] Duplicate receiving prevented
- [ ] Tenant isolation verified
- [x] Responsive layouts checked (390 / 768 / 1280, 2026-11-22)
- [ ] Empty/loading/error states checked
- [ ] Deployment verified
- [ ] Demo walkthrough ready

## Current blockers

- Phase 5 is complete apart from product image upload (slice 10) and CSV import
  (P2, not started); slices 1–9 are committed. Phase 6a (responsive pass and
  viewer visibility) is committed as `a392ca2`; the rest of Phase 6 (journeys,
  empty/error states, deployment, walkthrough) has not started.
- Verification note, not a page defect: when the automated preview tab is
  hidden (`document.visibilityState` is `hidden`), React defers the streamed
  Suspense reveal to `requestAnimationFrame`, which a hidden tab pauses. The
  response, the HTML and the data are complete (they were re-fetched and
  compared); focusing the tab and reloading, or flushing the queued reveal,
  shows the page. Both `next dev` and `next start` behaved the same way.
- The hosted stage cannot show catalogue or stock data: `db:seed` refuses
  non-loopback databases, so a hosted demo needs an approved data path first.
- Auth redirect allowlist entries for `http://localhost:25000/**` and
  `https://inventory-stage.vercel.app/**` are still unconfirmed. Password sign-in
  does not use them; confirmation, recovery and invite emails do.

## Recently completed

Add date, task, verification method, and result.

- **2026-11-22 — Phase 6a: responsive pass and viewer visibility (committed `a392ca2`).**
  The four list screens now share `src/components/detail-panel.tsx`: the sticky
  360px column from 900px, and below that a fixed overlay under the header with
  a scrim that closes it, so opening a row no longer pushes the table away on a
  phone. `globals.css` gains a `max-width: 899px` block that lifts every control
  to 44px and gives table row links padding, instead of touching ~110 class
  usages; the mobile nav links got `shrink-0` so labels stop colliding. Measured
  in the preview at 390×844, 768×900 and 1280×900: no page-level horizontal
  overflow on dashboard, products, inventory, purchase orders, suppliers,
  reports or settings; panels are 350/668px overlays below 900px and a 360px
  column beside the list at 1280. Viewer (role `viewer`) now receives no cost or
  value anywhere: `listBusinesses` returns the membership role (failing closed to
  `viewer`), dashboard stock-value card, product cost/selling, inventory value,
  order value and unit costs, report cost/value columns and the valuation table
  are all omitted, write controls inside those panels disappear, and
  `/reports/export` answers 403. Verified by temporarily setting
  `owner@cafe.test`'s cafe membership to `viewer`: every screen carried no `$`,
  reset panel absent, all four exports 403; restoring `owner` brought the values
  and the 200 export back. Gates: `check` 0 errors (2 pre-existing `_role` /
  `_action` warnings), unit 72/72, DB 44/44, build clean, `secrets:check ok`.
- **2026-11-22 — Phase 5 slice 2 committed as `906a7c2`.** Demo reset. Settings
  gains a Demo data panel showing what the business currently holds (products,
  categories, suppliers, orders, movements, receipts) and a typed-confirmation
  reset. The work goes through `private.reset_demo_business(business_id, payload)`,
  a `SECURITY DEFINER` function that checks the caller owns the business, deletes
  its rows in foreign-key order (receipt lines, receipts, order lines, orders,
  ledger, products, suppliers, categories) and rebuilds the catalogue, opening
  balances and demonstration orders from the payload. The payload is built from
  `db/seed-demo.ts`, which `db:seed` now also uses, so a reset lands on exactly the
  seeded baseline rather than a second, drifting copy: 60 cafe products, 160 retail
  lines, 9/6 suppliers and the same two cafe orders (PO-0001 ordered, PO-0002
  draft). The function bounds the payload (50 categories, 50 suppliers, 500
  products, 20 orders), refuses any status other than draft/ordered, and raises
  rather than writing a product or order line it cannot resolve. The app still
  never holds an owner connection; owners see the panel, staff and viewers get a
  line saying only an owner can reset. Verified: seed refactored and run twice with
  identical output (2 businesses, 3 demo users, 4 memberships, 220 products, 219
  opening movements, 2 purchase orders); unit 72/72 (6 new for the payload);
  database 44/44 (6 new: rebuild and reported counts, the payload's on-hand and
  order values, another business untouched, staff/viewer/stranger refused with the
  same message, no-session refusal, and rollback when an order line names an
  unknown product); check 0 errors (2 pre-existing warnings); production build 0
  errors; `secrets:check` ok. In a browser as `owner@cafe.test`, the panel read 60
  products, 9 categories, 9 suppliers, 2 orders, 60 movements and 0 receipts after
  a deliberate 2 kg stock-in, the button stayed disabled until RESET was typed, and
  the reset reported "Demo data restored: 60 products, 9 suppliers, 2 orders and 59
  opening movements." Postgres then showed the drift gone (tomatoes 18 again, 59
  movements, no receipts, PO-0001 ordered with three lines and nothing received,
  PO-0002 still draft) and the retail business untouched at 160 products and 160
  movements; the dashboard returned to $4,505.30 with one open order and $131.80 on
  order. Not verified: a staff or viewer signed in against the panel (the database
  refuses them, and the screen reads the role); the retail business's reset in a
  browser (only the cafe account is linked, though the retail payload is unit
  tested); narrow widths and touch targets.
- **2026-11-22 — Phase 5 slice 9 committed as `d2d0149`.** Reports and CSV
  export. The placeholder is replaced by five reports over the same rows the
  operational screens use: stock on hand (search, stock status), low stock (the
  same query pinned to shortages, out of stock first), the movement ledger with a
  product search, movement type and a date range, order status with received lines
  and outstanding value, and valuation at cost grouped by category with each
  category's share. Stock on order counts `ordered` and `partially_received` only,
  and a draft's outstanding value is zero rather than its full value. Every list is
  paginated at 50 and lives in the URL, so a filtered view can be bookmarked.
  `GET /reports/export` runs the identical query with the page limit removed and
  returns RFC 4180 CSV with CRLF line endings, a `content-disposition` filename
  (`demo-cafe-stock-2026-11-22.csv`) and `private, no-store`; the business comes
  from the session, never the URL, and text cells a spreadsheet would treat as a
  formula are prefixed with an apostrophe while numbers stay numeric. Verified:
  check 0 errors (2 pre-existing warnings); unit 66/66 (21 new: CSV escaping and
  injection guard, filename, URL parsing, per-report CSV rows); database 38/38;
  production build 0 errors with `/reports` and `/reports/export` present;
  `secrets:check` ok. In a browser as `owner@cafe.test`, each report matched
  Postgres directly: stock 60 products in two pages (50 + 10) with $4,505.30 of
  value, low stock 2 products with Pork belly (0 of 2) above Cocoa powder (1 of 1),
  movements 59 lines with an opening-balance label and a reference column, order
  status 2 orders with PO-0001 owing $131.80 and the draft owing nothing, and
  valuation 9 categories totalling $4,505.30 at 100%. Search plus the shortage
  filter returned 1 product and the export link carried both parameters; choosing
  a received-only filter produced the empty state and a header-only CSV; a
  same-day date range returned 59 on screen and in the file; an impossible date
  was ignored; and stock page 2 exported all 60 rows. The unauthenticated export
  request is redirected to sign-in, so no CSV is served without a session. Not
  verified: the retail business's reports in a browser (only the cafe account is
  linked); narrow widths and touch targets; a CSV opened in Excel or Sheets.
- **2026-11-22 — Phase 5 slice 8 committed as `0291bad`.** Dashboard. The
  placeholder is replaced by figures read from the tables on every request: a
  five-stat strip (products, stock value at cost, low or out, open orders with the
  value on order, suppliers), a needs-attention table (out of stock first, then
  low, each with on-hand, reorder level, quantity on order and supplier) and the
  eight most recent ledger lines. `src/lib/dashboard.ts` runs three reads in one
  `withTenant` transaction, and stock on order counts `ordered` and
  `partially_received` orders only, so a draft reserves nothing. Each stat links
  to the screen behind it. The movement labels now cover `opening` and `received`,
  which the inventory history previously rendered blank; both screens share
  `LEDGER_MOVEMENT_LABELS`. Verified: check 0 errors (2 pre-existing warnings);
  unit 45/45 (1 new); database 38/38; production build 0 errors; `secrets:check`
  ok. In a browser as `owner@cafe.test` the page showed 60 products, $4,505.30 at
  cost, 2 low or out (1 out · 1 low), 1 open order with $131.80 on order and 9
  suppliers, each equal to the same figures queried directly in Postgres; Pork
  belly (0 of 2) sorted above Cocoa powder (1 of 1) with their suppliers; and the
  eight newest movements all carried "Opening balance". A scratch ordered order
  for 6 × Cocoa powder raised open orders to 2, the value on order to $223.00 and
  showed 6 on order on Cocoa's row, then was deleted to restore the baseline. Not
  verified: the retail business's dashboard in a browser (the cafe account is the
  only linked membership); narrow widths and touch targets.
- **2026-11-22 — Phase 5 slice 7 committed as `5691948`.** Purchase orders and
  transactional receiving. Migration `0005` adds `private.receive_purchase_order`
  and `private.set_purchase_order_status`, and takes the integrity fields away
  from the application role: `authenticated` can no longer insert or update
  `status`, `ordered_at`, `received_quantity` or a receipt directly (column-level
  grants), order edits are draft-only by policy, and the transitions
  draft→ordered, draft/ordered/partly received→cancelled are the only ones the
  function allows. Receiving locks the order, replays a repeated idempotency key
  instead of double-posting, rejects duplicate lines in one payload, refuses a
  line from another order, rejects over-receipt with the outstanding quantity and
  product in the message, writes one receipt, its lines and one `received`
  movement per line, raises the line balances and moves the status. The screens
  add a dense order list with search and status filters, a supplier-filtered
  draft editor (cost pre-filled from the product), the detail panel with lines,
  outstanding quantities, delivery history, mark-ordered and a confirmed cancel,
  and a per-delivery receiving form pre-filled to what is due with a
  server-generated idempotency key. The seed adds PO-0001 (ordered, three produce
  lines) and PO-0002 (draft, dairy) and stays idempotent across runs. Verified:
  migration applied (1 file, 6 tracked); unit 44/44 (12 new); database 38/38 (18
  new, including idempotent replay, a reused key on another order, duplicate
  lines, another order's line, over-receipt writing nothing, direct writes to
  `received_quantity` refused, draft-only line edits, one-open-order and both
  concurrency cases); check 0 errors; secrets ok; production build 0 errors. In a
  browser as `owner@cafe.test`: 2 orders with 1 awaiting delivery and $131.80 on
  order; PO-0001 showed three lines and the receiving form; a 5-of-12 tomato
  delivery left the order partly received, 2 of 3 lines complete, $29.40 still on
  order and one three-line receipt; 8 tomatoes against 7 outstanding was refused
  with "Only 7 kg of Tomatoes, truss is outstanding on this order." and wrote
  nothing; the remaining 7 completed the order, produced a second receipt and
  moved on-hand by exactly 12 kg tomatoes, 20 kg potatoes and 3 kg garlic;
  PO-0002 opened as a draft with its two lines, saved unchanged as a draft and
  created PO-0003 for Harbour Line Meats at $95.30, which then marked as ordered.
  The scratch order was deleted and PO-0001 restored to ordered with no receipts,
  so the demo baseline is unchanged. Not verified: narrow widths and touch
  targets; the viewer role through these screens (the database refuses its writes
  but cost and value are still visible); a real delivery on a phone.
- **2026-11-22 — Phase 5 slice 6 committed as `872555d`.** Stock ledger and
  inventory. Migration `0004` adds `private.record_stock_movement`, a
  `SECURITY DEFINER` function and the ledger's only write path (`authenticated`
  still holds no INSERT grant): it checks membership and owner/staff, locks the
  product row, recomputes the sum and raises instead of allowing a negative
  result, requires a reason for an adjustment, records the caller, and refuses
  `opening` so the manual form cannot mint an opening balance. The inventory screen
  reads on-hand from `product_stock` and offers search, category, stock status and
  three sorts, a summary of counts and value at cost, and a panel with position,
  unit, supplier, the last 12 ledger lines and a stock in / stock out / adjustment
  form. Writes are a server action that resolves the business from the session,
  validates with Zod (`stockMovementSchema`) and calls the function; the form
  cannot submit a final quantity, only a delta. Verified: migration applied (1
  file, 5 tracked); unit 32/32 (12 new); database 20/20 (11 new — role refusal,
  no membership, reason required, an unsupported type, negative stock with no row
  written, no existence oracle for another tenant's product, and two concurrent
  movements where the second is rejected after the lock is released); check 0
  errors; build 0 errors with `/inventory` as a dynamic route. In a browser as
  `owner@cafe.test`: 60 products, 1 out, 1 low, $4,505.30 at cost; the out filter
  returned Pork belly only; a 3 kg delivery showed 3 kg ok, $50.40 and a +3
  history line; 999 out was refused with the below-zero message and wrote nothing;
  an adjustment with no reason was refused; a 1 kg adjustment recorded -1, left
  2 kg low and moved the summary to $4,538.90. The two test movements were deleted
  afterwards, so on-hand is back to the seeded baseline. Form fields are
  controlled, because React resets an uncontrolled form after every action and a
  rejected quantity would otherwise vanish. Not verified: narrow widths and touch
  targets; the viewer role through a screen (the database refuses it, but no
  screen hides cost or stock value yet).
- **2026-11-22 — Phase 5 slice 5 built locally, uncommitted.** Suppliers: a dense
  list with search over name, contact or email and an archived toggle; a detail
  panel showing contact details, address, notes and the products supplied with
  their on-hand; create, edit, archive and restore through server actions that
  resolve the business from the session and validate with Zod. The seed now adds
  15 fictional suppliers — nine for the cafe, six for the retail store — with
  reserved `.invalid` addresses and 5550-range phone numbers, and links every one
  of the 220 products to a supplier by category, so the product form's supplier
  select is live and the product panel shows the name. Verified: seed run twice
  keeps 9 and 6 suppliers and 220 products; no product is left without a supplier;
  the list rendered 9 cafe suppliers with per-supplier counts, Fresh Fields
  Produce listed its 12 produce lines, a probe supplier was created, archived and
  deleted, and the product form offered all nine with the placeholder hint gone.
  Gates: check 0 errors (2 pre-existing warnings), unit 20/20 (5 new), DB isolation
  9/9, build 0 errors, `secrets:check` ok. Not verified: narrow widths and touch
  targets, and the archived supplier's exclusion from the product form was read
  from the query rather than exercised with an archived row present.
- **2026-11-22 — Phase 5 slice 4 built locally, uncommitted.** Products and
  categories: a dense table with URL-held filters (name or SKU search, category,
  archived, five sort keys, 50-per-page pagination), a detail panel driven by
  `?product=`, create and edit forms, archive and restore, and category management
  in Settings. Writes are server actions that resolve the business from the
  session, validate with Zod (`productInputSchema`) and run inside `withTenant`, so
  a form's ids are lookups and never authority; a duplicate SKU is reported as a
  form error. The seed now carries the Gate A catalogue: 60 cafe ingredients and
  160 retail lines across 19 categories, plus 219 `opening` movements, so on-hand
  and the low/out states are real ledger sums. Verified: seed run twice reports 220
  products and 219 opening movements both times; `local/verify-products.ts` acting
  as the linked Supabase id returns 60 cafe products with categories resolved,
  search "tomato" finds 2, the Produce filter returns 12, the retail business
  returns 0 rows for the cafe owner, and a create → update → archive round trip
  hid the row from the default list while "Include archived" still showed it (the
  probe row was deleted afterwards). Gates: check 0 errors (2 pre-existing
  warnings), unit 15/15 (9 new), DB isolation 9/9, build 0 errors, `secrets:check`
  ok. Verified in a browser on 2026-11-22, signed in as `owner@cafe.test`: the list
  rendered 60 products with category counts and two pages, the detail panel and
  its edit form round-tripped a reorder change with a "Product saved" state,
  create normalised a lowercase SKU and added the row, archive hid that row and
  restore returned it, and Settings added a category. Probe rows were deleted
  afterwards.
- **2026-11-22 — Auth user linked; seed fixture collision fixed.** The Supabase
  account `owner@cafe.test` (id `7de96fda-b270-41b8-93d9-f9dd4ae50130`) was already
  confirmed, had a password, and recorded `last_sign_in_at` 2026-11-22 03:18:54, so
  password sign-in has succeeded against Supabase at least once. The first
  `db:link-user` run failed with `users_email_key`: the seed fixtures had claimed
  `owner@cafe.test`, `owner@retail.test` and `staff@cafe.test`, and email is unique
  in both the local shim and Supabase, so a developer who registered a seeded
  address could never link it. Fixtures moved to reserved `.invalid` addresses,
  re-seeded (2 businesses, 3 demo users, 3 memberships) and linked again.
  Verified: `withTenant(7de96fda-…)` returns `["Demo Cafe"]` while the retail owner
  sees `["Demo Retail"]` and a random id sees `[]`; a ledger insert as
  `authenticated` still fails `42501`; `current_user` and `role` are both
  `authenticated`. Gates: check 0 errors (2 pre-existing warnings), unit 6/6,
  build 0 errors with 8 dynamic routes plus static `/_not-found`, `secrets:check`
  ok. Not verified: a browser session rendering Demo Cafe after sign-in, because
  the account's password is not held here. Still open: Supabase redirect allowlist
  entries for `http://localhost:25000/**` and the stage origin.

- **2026-11-21 — Auth slice built locally, uncommitted.** Supabase Auth via
  `@supabase/ssr` (2 new dependencies), session cookies refreshed in `src/proxy.ts`
  (Next 16 renamed `middleware.ts`; a root-level `middleware.ts` never ran),
  protected routes redirecting to `/sign-in` with a validated `next` path, sign-in
  and sign-out server actions, and every query now running through
  `withTenant(userId)`: connect as `app_user`, `BEGIN`, `SET LOCAL ROLE
authenticated`, `set_config('request.jwt.claims', {sub}, true)`. Verified: `/` and
  `/settings` return 307 to `/sign-in` (`?next=%2Fsettings`), `/sign-in` 200, a
  wrong-password submit reached Supabase and rendered "Email or password is not
  correct.", `withTenant` returned only Demo Cafe for the cafe owner, only Demo
  Retail for the retail owner and nothing for a stranger, ledger insert `42501`,
  `current_user`/`role` both `authenticated`, `grep` finds no owner-URL reference in
  `src/`, and the DB suite still passes 9/9. Gates: check 0 errors, build ok
  (`ƒ Proxy (Middleware)`), unit 6/6, secrets ok. Not verified: a successful sign-in
  and the shell rendering real data for a signed-in user, because no confirmed auth
  user exists yet.
- **2026-11-21 — Phase 5 slice 1 built locally, uncommitted.** Direction C shell:
  76 px dark rail with 10 px labels from 600 px up, horizontal labelled bar below,
  compact top bar with the demo business selector, `sr-only` full nav names, and
  placeholder sections that state what is coming rather than showing dead
  controls. Settings reads real business fields. Verification: `npm run check` 0
  errors (2 pre-existing warnings), `npm run test:run` 6/6 (4 new business-selection
  tests), `npm run build` 0 errors with all 8 routes dynamic, `secrets:check` ok.
  The business selector was exercised in the browser: changing it fired the server
  action (`POST /` 200) and both the header and the page switched to Demo Retail;
  `/settings` with a `demo_business` cookie also rendered that business's name and
  id. The 375 px accessibility tree shows the horizontal labelled bar with full
  names. Not run: a human using the native select popup, and visual (pixel) review
  at any width.
- **2026-11-21 — Stage deployment live.** Vercel project `inventory-stage` at
  `https://inventory-stage.vercel.app` returns 200 with the tenant shell page, no
  deployment protection. Supabase Site URL set to the same origin; publishable key
  accepted by `/auth/v1/health` (200) and `/auth/v1/settings` (200, email enabled,
  signups open). The deployed build does not read any env var yet, because no
  product code exists, so the imported Vercel variables are unexercised. Auth
  redirect allowlist entries for `http://localhost:25000/**` and the stage origin
  are still to confirm.
- **2026-11-21 — Hosted database migrated, app role provisioned.** Applied the four
  migrations to the Sydney Supabase project (`db:migrate:hosted`: 4 applied, re-run
  0 of 4 tracked). Created `app_user` with `db:app-role` (login, noinherit, no
  bypassrls, member of `authenticated`) and wrote `DATABASE_URL_APP` to
  `.env.local`. Proved hosted isolation as `app_user`: stranger sees 0 rows across
  four tables, ledger and receipt inserts `42501`, cross-business product insert
  `42501` by RLS, direct select without `SET ROLE` `42501`. Compose stays the
  day-to-day database. Key model updated to publishable/secret, since Supabase
  deprecates `anon`/`service_role` at the end of 2026.
- **2026-11-21 — Gate D approved.** DD1–DD8 accepted as recommended: Supabase Free
  in Sydney, Vercel Hobby while internal, owner connection only for migrations,
  `app_user` through the transaction pooler as `authenticated`, no service-role key,
  private image bucket, migrations run from this machine. Record in
  `docs/decisions/0008-gate-d-approval.md`. Nothing hosted existed at approval;
  Phase 4 stays in progress until the hosted database is migrated and
  `npm run test:db` passes against it.
- **2026-11-21 — Database integration tests added; Gate D checklist prepared.**
  `tests/db/tenant-isolation.test.ts` runs against real migrations in CI and
  proves cross-tenant reads return nothing, a non-member sees nothing, and the
  ledger and receipts reject direct writes. Nine tests pass locally; the suite was
  mutation-checked (RLS disabled fails four; granting INSERT on `stock_movements`
  fails one), so the assertions are not vacuous. Gate D costs, credential split and
  env vars are in `docs/plans/phase-4-gate-d-checklist.md`; nothing hosted created.
- **2026-11-21 — Phase 4 local tooling complete.** `drizzle-kit` with a real config,
  three migrations (schema, placeholder retirement, RLS and tenant isolation), real
  `db:migrate` and `db:seed` runners, and a CI step that fails when no migration
  applies. Verified against PostgreSQL 17 in compose: fresh migrate applies 3 and
  exits 0; re-run applies 0 and exits 0; `db:migrate:ci` on a current database exits
  1; seed run twice reports 2 businesses, 3 users, 3 memberships both times; 10
  tables plus `product_stock` in `public`; the four placeholder tables gone; 24
  policies; a cafe owner sees 0 retail rows; a direct ledger insert as `authenticated`
  is denied. Deviations and their causes are in
  `docs/plans/phase-3-architecture.md` §13. No hosted resource created.
- **2026-11-21 — Phase 3 complete; Gate C approved.** Architecture pack
  `docs/plans/phase-3-architecture.md` accepted with all ten decisions (DC1–DC10) as
  recommended, and the three open questions resolved in
  `docs/decisions/0007-gate-c-approval.md`. The proposed DDL had been applied to
  PostgreSQL 17.12 in a scratch database with assertions on tenant foreign keys, the
  one-open-order index, over-receipt and RLS visibility; all passed. No product code
  written.
- **2026-11-21 — Phase 3 architecture pack prepared; Gate C pending.** Architecture,
  schema, RLS and tenant isolation, stock ledger, transactional receiving, auth and
  storage, environments, testing plan, risks and ten decision points recorded in
  `docs/plans/phase-3-architecture.md`. Verified while writing: `drizzle-kit` is not
  installed, `db/migrations/` is empty, `db/migrate.ts` and `db/seed.ts` only print,
  and the CI migration step therefore passes without touching a database — listed as
  Phase 4 prerequisites. The proposed DDL was also applied to PostgreSQL 17.12 in
  a scratch database with assertions on cross-tenant foreign keys, the
  one-open-order index, over-receipt and RLS visibility; all passed. No schema or
  product code in the repository changed.
- **2026-11-21 — Phase 2 complete; Gate B approved.** Three interactive
  directions and a comparison built and exercised in `local/phase-2-design/`
  (unversioned by design). Verified in a browser: business switching, partial
  receiving with over-receipt capped at the outstanding quantity, adjustments
  writing one ledger row, drawer and modal flows, split-view selection, and
  keyboard shortcuts; no console errors. Direction C adopted, with readability
  floors, a visible panel close and optional shortcuts recorded as required
  fixes; rationale in `docs/decisions/0006-gate-b-design.md`, design system in
  `docs/design-exploration.md`.
- **2026-11-21 — Phase 1 complete; Gate A approved.** Twenty public sources
  reviewed and logged; findings, matrix and synthesis in
  `docs/competitor-research.md`; personas in `docs/personas.md`; D1–D6 accepted
  in `docs/decisions/0004-gate-a-scope.md` and
  `docs/decisions/0005-stack-hybrid-supabase.md`. Verified: every claim traces to
  a dated public source, no product code written, research deliverables in
  `local/phase-1-discovery/`.
- **2026-11-21 — Phase 0 closed.** Repository assessment, proposed immediate plan
  and the assumptions/questions list recorded in
  `docs/plans/phase-0-assessment.md`. Gate A not yet requested.
- **2026-11-21 — Repository assessed and shell made runnable.** Declared and
  installed the toolchain, added the configs and a minimal App Router entry, and
  fixed two scripts that failed on their own. Verified: `npm run check`,
  `npm run test` (1 file, 2 tests), `npm run build`, `npm run secrets:check` all
  exit 0; smoke and 1 E2E test pass against a started server; CI run 44901773015
  succeeded on GitHub.
- **2026-11-21 — Project documentation imported.** Brief material moved from the
  local kit into `docs/`; stack conflict recorded in
  `docs/decisions/0003-stack-target.md`. No product code written.
