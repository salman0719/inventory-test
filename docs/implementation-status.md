# Implementation Status

Keep this file current. Do not report a task as complete until it has been verified.

## Overall status

- Current phase: Phase 6 (validation). Slices 1 and 3–9 are committed — shell/selector,
  Supabase Auth with the authenticated `app_user` request path, products and
  categories, suppliers, the stock ledger with inventory screens, purchase orders
  with transactional receiving, the dashboard, and reports with CSV export. The
  Supabase account `owner@cafe.test` is linked to the local Demo Cafe, so signing in
  with it renders real catalogue data. Slice 2 (the demo reset workflow) is
  committed as `906a7c2`; every Phase 5 slice is now built apart from product
  images and CSV import. Phase 6a is committed as `a392ca2`, and the product,
  supplier, stock and purchase-order journeys were walked in the browser on
  2026-11-22: defects D1–D3 are fixed (`0ef1b41`, `b368be9`, `1219908`)
- Current deployment: Vercel stage at `https://inventory-stage.vercel.app`
  (public, no deployment protection; serves `main` through `e50688a`, with the
  hosted Supabase database seeded through `db:seed:hosted`)
- Last updated: 2026-11-23

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

- [x] Core journeys tested (2026-11-22: product, supplier, stock movement and
      purchase order; D1–D3 found, all fixed)
- [x] Partial receiving tested (2026-11-22: two deliveries on PO-0003)
- [x] Duplicate receiving prevented (2026-11-22: repeat submit and a stale
      second-tab form both refused)
- [x] Tenant isolation verified (2026-11-22: business switch both ways and
      foreign product, supplier and order ids refused)
- [x] Responsive layouts checked (390 / 768 / 1280, 2026-11-22)
- [x] Empty/loading/error states checked (2026-11-22: list and report empty
      states, the route skeleton and both error paths; D4 and D5 fixed)
- [x] Deployment verified (2026-11-22: redirect allowlist confirmed, `main`
      deployed, stage sign-in returned the seeded baseline figures)
- [x] Demo walkthrough ready (approved 2026-11-22; demo will be hosted, not local-only)

## Current blockers

- Phase 6 continues. The four core journeys were walked in the browser on
  2026-11-22, including partial receiving and a duplicate receive, which found
  three defects. D1 (product and supplier forms lost what was typed when the
  server rejected a save) is fixed in `0ef1b41`; D2 (the movement select showed
  "Stock in" after a rejected adjustment) is fixed in `b368be9`; D3 (a stale
  "saved" notice during archive/restore) is fixed in `1219908`. Tenant isolation
  was walked on 2026-11-22 with no defect found. Empty, loading and error states
  were walked on 2026-11-22, which found D4 (unknown routes showed Next's default
  unstyled 404, outside the shell; fixed with `src/app/not-found.tsx`) and D5 (a
  database outage fails in the layout query, above `error.tsx`, so the app's error
  panel is replaced by Next's generic error page; fixed with `src/app/error.tsx`).
  The demo walkthrough is approved and deployment was verified on 2026-11-22
  (demo is hosted, not local-only). Business
  switching is demoable without SQL: `db:link-user` now links the account to both
  demo businesses by default.
- Verification note, not a page defect: when the automated preview tab is
  hidden (`document.visibilityState` is `hidden`), React defers the streamed
  Suspense reveal to `requestAnimationFrame`, which a hidden tab pauses. The
  response, the HTML and the data are complete (they were re-fetched and
  compared); focusing the tab and reloading, or flushing the queued reveal,
  shows the page. Both `next dev` and `next start` behaved the same way.
- No Phase 6 blocker remains: deployment is verified (2026-11-22) and the hosted
  data path is `db:seed:hosted`.
- Local environment note: wiping and recreating schema `public` no longer needs
  a hand-run grant. `0007_public_schema_usage.sql` grants `USAGE` to
  `authenticated`, so a replay of the committed migrations restores it
  (see `docs/known-limitations.md`). Hosted Supabase recorded `0007` on
  2026-11-22 (applied 1, 8 tracked); its `public` ACL already granted
  `authenticated` USAGE, so only the migration record changed there.

## Recently completed

Add date, task, verification method, and result.

- **2026-11-23 — The phone gets bottom tabs, and the wordmark moves into the
  header.** Below 600px `AppNav` renders a fixed bottom bar on the rail colour
  with Dashboard, Products, Stock and More; the other four screens open in a modal
  More sheet. The header carries the “Stk” wordmark as the home link, and `main`
  reserves 76px plus the safe-area inset so the pager is never under the bar. The
  detail panel's overlay now paints above the bar instead of ending behind it.
  Verified on the running dev server with
  `npx tsx local/prototypes/mobile/measure-impl.ts`: at 390×844 the bar spans
  788–844 (56px) on `rgb(15, 23, 42)` with four tabs 94px wide and 52px tall, none
  off-screen, the current tab marked on `/products`, the wordmark 44px tall in the
  52px header, `main` padding 76px, and no document overflow; scrolled to the
  bottom of `/products` the last row ends at 711px and the pager at 768px against
  a bar top of 788px; an open product panel runs to 844px and covers the bar; the
  More sheet lists Suppliers, Purchase orders, Reports and Settings, closes on
  Escape with focus back on its button, and following Reports closes it and marks
  More current; at 1280×900 the rail is the only primary nav (left 0, top 52), the
  header wordmark is hidden and `main` padding is 20px. Gates on the branch:
  `npm run check` exit 0 (0 errors, the same 2 pre-existing warnings in
  `src/lib/permissions.ts`), `npm run test` 131/131 in 23 files, `npm run build`
  exit 0 (13 routes plus the proxy), `npm run secrets:check` ok. Decision and
  contrast numbers in `docs/decisions/0009-mobile-navigation.md`. Card lists,
  the filter sheet and the pinned detail sheet remain unimplemented.
- **2026-11-23 — The business switch redirects to the dashboard and shows the top
  bar.** `selectBusiness` ends with `redirect("/")` after setting the cookie and
  revalidating the layout, so a switch can no longer leave the previous business's
  URL in place: its filters, page number and open panel described rows of the
  business being left, and a foreign panel id resolved to a "not in this business"
  panel. `BusinessSwitcher` renders `RouteProgress active={pending}`, the same 3px
  bar a link click paints, because the redirect is a route change that the screen
  being left cannot otherwise acknowledge. Measured with
  `local/perf/business-switch-probe.ts` (2 runs per start, both directions, signed
  in, `next dev` on :25000, 1280×900, first and last frame each signal appears):
  from `/products` the bar painted at 16 and 23 ms and stayed until 156 and 274 ms;
  the path became `/` at 197 and 323 ms with the header badge and dashboard heading
  (Demo Retail / Demo Cafe) committing in the same frame; from `/` — already home —
  the bar painted at 18 ms and the data committed at 192/164 ms without a path
  change, so a switch on the dashboard still refreshes it. 0 document requests in
  every run, and each switch made a single request, the server action POST to the
  current URL, from which the dashboard committed; no second fetch was observed. The
  bar ends 37–49 ms before the new screen commits, because the transition ends with
  the action, not with the navigation it starts. The bar is `aria-hidden`, so the
  selector also names the destination in a polite `role="status"` — "Switching to
  Demo Retail" — first seen at 9–22 ms across runs and cleared when the
  transition ends; that is the only screen-reader signal before the dashboard
  commits. Gates: `npm run check` 0 errors
  (2 pre-existing `_role`/`_action` warnings), `npm run test` 131/131 across 23
  files, `npm run build` clean, `secrets:check ok`. Not committed; not reviewed at
  other widths, on a throttled connection or in a production build.
- **2026-11-23 — Clear reports to the region, and all four lists swap rows.** The
  filter bar's Clear now renders `LinkBusy`, so a Clear navigation flips the same
  `data-busy` flag Apply's transition does and the table swaps its body. Suppliers
  and purchase orders gained the region and matching skeleton bodies in their
  tables, which were previously one body outside any `ResultsBusy`. Measured with
  `local/perf/filter-submit-probe.ts` (2 runs per case, signed in, `next dev` on
  :25000, 1280×900, first frame each signal appears): products Apply
  `data-busy`/skeleton 118 → 130 ms, Clear 98 ms bar only → 100 ms bar plus
  busy/skeleton 113 ms; inventory Apply 97 → 116 ms, Clear 103 → 77 ms bar plus
  94 ms busy/skeleton; suppliers Apply "Applying…" only at 82 ms → 92 ms plus
  111 ms busy/skeleton, Clear 71 ms bar → 81 ms plus 99 ms; purchase orders Apply
  "Applying…" only at 111 ms → 85 ms plus 104 ms busy/skeleton, Clear 92 → 76 ms
  plus 90 ms. All eight cases made 0 document requests (one RSC fetch for Apply,
  two for Clear), and the skeleton bodies are `display: none` until
  `[data-busy="true"]`, so they cost nothing when idle. Verified: `npm run check`
  0 errors (the 2 pre-existing `_role`/`_action` warnings), `npm run test` 131/131
  across 23 files (one new filter-form test: Clear flips the region busy), `npm run
build` clean. Not verified: throttled or production timings, the skeletons at
  other widths, and a viewer's five-column order table.
- **2026-11-23 — Filter Apply swaps in the skeleton rows; reports Apply is a
  transition.** The filter bar sat above `ResultsBusy` on products and inventory, so
  `TransitionBusy` reported to no region and an Apply left the old rows on screen;
  both bars now render inside the region. `ReportFilters` now uses `FilterForm`
  instead of a native GET submit, with a new `clearHref` prop so its Clear keeps
  `?report=` while the form's action stays `/reports`. Same browser probe
  (`local/perf/filter-submit-probe.ts`, signed in, `next dev` on :25000, 1280×900):
  inventory Apply before — no bar, no `data-busy`, no skeleton, "Applying…" at
  69 ms, 1 RSC fetch and 0 document requests; after — `data-busy` and the skeleton
  rows at 84 ms, "Updating results" announced, still 1 fetch and 0 document
  requests. Reports Apply before — 1 document request and 0 fetches, no "Applying…"
  label; after — 0 document requests, 1 RSC fetch, "Applying…" and `aria-busy` at
  61 ms. Inventory Clear is unchanged (bar at 65 ms, no skeleton, because a link
  reports nothing to the region). Suppliers and purchase orders are unchanged too:
  those pages have no `ResultsBusy` and their tables render no skeleton body, so
  Apply still shows only the button state and its sr-only announcement. Verified:
  `npm run check` 0 errors (the 2 pre-existing `_role`/`_action` warnings), `npm run
test` 130/130 across 23 files, `npm run build` clean. Not verified: throttled or
  production timings, and the layout consequence of wrapping the filter bar and the
  grid in one region (12 px between them instead of 16 px) has not been reviewed at
  any width.
- **2026-11-23 — `PendingLink` applied to the remaining route-changing links.**
  Every plain `<Link>` that starts a route change now uses `PendingLink`: the four
  list empty states ("Open products" and "Clear filters" on inventory, products,
  suppliers and purchase orders), the dashboard's empty-state "Open products", the
  reports tabs, the reports Clear filter, `EmptyReport`, `SectionPlaceholder`, the
  two 404 links, the panels' cross-links ("Open in catalogue", a supplier's
  products) and the filter bars' Clear. Left alone deliberately: `PanelLink` (opens
  a panel without a route navigation), `Pagination` (its own pending label plus the
  table's skeleton rows) and the filter _apply_ path (a `router.push` transition
  already reported to the results region). Verified: `npm run check` 0 errors (the
  2 pre-existing `_role`/`_action` warnings), `npm run test` 130/130 across 23 files
  (unchanged — the wrapper's own tests cover the behaviour), `npm run build` clean,
  `secrets:check ok`, and a browser probe (`local/perf/pending-link-probe.ts`, 3
  runs per case, signed in, `next dev` on :25000, 1280×900) saw the bar on 3 of 3
  runs for a reports tab (median 65 ms), the products empty state (median 74 ms)
  and the inventory empty state (median 73 ms). Not measured: a production build
  or a throttled connection, and the 404, the panel cross-links and the settings
  placeholders were not clicked in a browser.
- **2026-11-23 — One pending indicator for any link; dashboard links use it.**
  `LinkPending` (`src/components/link-pending.tsx`) holds the signal that
  `useLinkStatus` drives — the viewport `RouteProgress` bar, the rail's corner dot,
  or both — and `PendingLink` (`src/components/pending-link.tsx`) is a `<Link>` that
  renders it inside itself, so a Server Component can opt a link in without moving
  that screen to the client. `NavPending` now delegates to `LinkPending`, so there
  is one implementation. The dashboard's inventory links use `PendingLink`: both
  "Open inventory" headings, "See the rest in inventory", the per-row links
  (`/inventory?product=…`), and the stat tiles — the five tiles share one `Stat`
  component, so all five gain the bar, not only the two that point at inventory.
  Re-ran the same browser probe (3 runs per case, signed in, `next dev` on :25000,
  1280×900): the dashboard bar now paints 55–73 ms after the click (medians 72 for
  "Open inventory" and 62 for the "Stock value" tile) against 63–77 ms (median 74)
  for the rail; both still show the skeleton at 128–175 ms and the final screen at
  450–488 ms, so the added feedback costs nothing measurable. Verified: `npm run
check` 0 errors (the 2 pre-existing `_role`/`_action` warnings), `npm run test`
  130/130 across 23 files (4 new `pending-link` tests: a real anchor with its href
  and caller class, the bar while pending, the dot when asked, and the signal gone
  when settled), `npm run build` clean with the same dynamic routes and proxy,
  `secrets:check ok`. Not measured: a production build, a throttled profile, widths
  below 1280 px, and whether the bar reads well on the dashboard tiles at those
  widths.
- **2026-11-23 — Navigation feedback observed in a browser; dashboard links have
  none.** Signed in as the linked local account and drove a headless Chromium probe
  (`local/perf/nav-pending-probe.ts`; 3 runs per case; 1280×900; `next dev` on
  :25000; the DOM sampled every animation frame from the click until the Inventory
  heading existed). Rail link to `/inventory`: the `RouteProgress` bar and the
  pending dot painted 64–75 ms after the click (median 67), the inventory
  `loading.tsx` skeleton at 136–338 ms (median 165), the header and filter bar at
  457–666 ms (median 483). Dashboard "Open inventory" and the "Stock value" card:
  no bar and no dot at any point, the same skeleton at 129–281 ms (median 130),
  content at 446–603 ms (median 451). The skeleton, its `role="status"` "Loading
  inventory" announcement and the final screen are therefore identical from either
  entry point; only the acknowledgement before the first bytes differs. Not
  measured: a production build (dev disables viewport prefetching, so dev
  overstates the wait), a throttled profile, or widths below 1280 px.
- **2026-11-23 — Stage 3 item 3: one auth check per navigation.** The page's
  `getSessionUser()` no longer calls `supabase.auth.getUser()`: `src/proxy.ts`
  forwards the identity it verified as `x-verified-user-id` (and a percent-encoded
  `x-verified-user-email` when the session has one), and `src/lib/session.ts` reads
  those headers through Zod in `src/lib/verified-session.ts`. The email is
  percent-encoded because a header value must be ASCII; Zod validates the id as a
  UUID (it grants access) but not the email, since `z.email()` rejects valid
  addresses like `josé@example.com` and a rejected email would sign that user out.
  Cookies refreshed by the `getUser()` fallback are collected and replayed onto the
  response that carries the headers, so the browser still stores the new session.
  Measured in one session — same driver, old code stashed then restored, 40
  signed-in `/products` navigations per window, `NAV_TIMING=1` dev server on
  Windows against Docker Postgres: before, `proxy.claims` 1.3 ms p50 / 1.8 p95 and
  `session.auth` **40 samples**, 53.8 p50 / 116.1 p95; after, `proxy.claims` 1.3 p50
  / 2.0 p95 and `session.auth` **0 samples**. `proxy.auth` 0 in both windows, tenant
  transactions still 2 per page, `tenant.setup` 5.0 p50 / 8.8 p95. Client wall clock
  is not claimed as a delta: full-document fetches measured 566.5–621.2 ms p50 with
  a spread wider than the change. End-to-end checks with a real signed-in session:
  `/products` 200 for all 40 navigations, list and account email both rendered; the
  panel route handler answered 200 `private, no-store` with product data; the CSV
  export answered 200 `text/csv`; a signed-out panel request still got 307 to
  `/sign-in`. Verified: `npm run check` 0 errors (2 pre-existing warnings), unit
  **123/123** in 22 files, build clean with `ƒ Proxy (Middleware)` present,
  `secrets:check ok`.

  Token refresh, proven end to end later on 2026-11-23: a signed-in browser's
  stored session cookie was rewritten so both the access token's `exp` and the
  cookie's `expires_at` were in the past, then `/products` was loaded. The
  navigation request carried that expired cookie, answered 200 with the list and
  the account email rendered, and returned `Set-Cookie` for the auth cookie; the
  stored session then held a different access token (new `exp` an hour out) and a
  different refresh token, and a second navigation reused it without refreshing
  again — 8/8 checks in `local/perf/prove-refresh.mjs` (untracked). The refresh
  happens while `getClaims()` loads the expired session, before local
  verification; `getUser()` remains the fallback when local verification cannot
  decide. Covered by a unit test that a `getUser()` refresh's cookies reach both
  the forwarded request and the response.

  The rejected half, same session: replacing that expired cookie's refresh token
  with a value Supabase refuses made `/products` answer 307 to
  `/sign-in?next=%2Fproducts` with no `Set-Cookie`; the sign-in page answered 200
  and carried the dead cookie's `Max-Age=0` deletion, so the browser dropped it, a
  second `/products` visit redirected with no refresh attempt left (110 ms), and
  signing in again worked — 5/5 checks in
  `local/perf/prove-refresh-rejected.mjs` (untracked). Covered by tests for the
  redirect when both verification paths fail and for the deletion reaching the
  response on the signed-out sign-in pass-through.

- **2026-11-22 — Stage 3 item 2: the proxy verifies locally (`bb6dcea`).**
  `src/proxy.ts` now calls `supabase.auth.getClaims()`, which checks the access
  token's signature against the project's published ES256 JWKS, and only falls back
  to `getUser()` when local verification cannot decide — no cookie, an expired token,
  a failed signature. That fallback is also what refreshes the session and writes new
  cookies, so token refresh still happens; it just no longer runs on every request.
  Re-measured with the same protocol (fresh marker, 40 signed-in navigations in two
  batches of 20): `proxy.claims` p50 **3.1 ms**, p95 **11.2 ms**, max 53.8, and
  **zero `proxy.auth` samples** in the window — the round trip is not happening, and
  if the SDK had fallen back internally the number would have looked like the old
  89 ms, not 3 ms. Against the recorded baseline that is 89.3 → 3.1 ms p50 and
  623.0 → 11.2 ms p95 for the proxy layer. `session.auth` (the page's own
  `getSessionUser()`) was unchanged in code and measured 159.9 ms p50 / 593.7 p95 in
  this window, so it is now the only Auth round trip in a navigation and dominates
  it. Client wall clock: p50 219.3 / 224.4, p95 684.3 / 794.9 — inside the spread of
  earlier runs, so no end-to-end change is claimed even though the proxy layer
  improved by ~85 ms at p50; the page-side call happens to have been slower in this
  window. Tenant numbers were noisier this run (`tenant.setup` 7.9 p50 / 99.7 p95 vs
  4.8 / 11.6 last time) with the same code and 2 transactions per page, which is
  why only per-layer deltas are claimed. Trade-off recorded in
  `docs/known-limitations.md`: a session revoked server-side stays usable until its
  access token expires, because local verification cannot see revocation. Verified:
  `npm run check` 0 errors (2 pre-existing warnings), unit 103/103, `test:db` 44/44
  (the proxy change does not alter RLS), build clean, `secrets:check ok`.
- **2026-11-22 — Panel endpoints on one transaction; `getClaims` prerequisite confirmed (`66d8979`).**
  The product, supplier and order panel endpoints loaded several things per open and
  each read took its own transaction. Each now calls one function that reads inside a
  single transaction (`getProductPanel`, `getSupplierPanel`, `getOrderPanel`), with the
  per-function wrappers taking an optional client; the inventory panel already read
  its item and its movements in one function, so it was left as it was. The order
  panel's "is this still a draft" decision moved into `getOrderPanel`, because it sits
  between the two reads it depends on. Re-measured with `NAV_TIMING=1` against 20 panel
  opens (five per endpoint, warm server, one real row each): `proxy.auth` p50 45.2 /
  p95 60.4, `session.auth` p50 47.2 / p95 62.7, `tenant.setup` p50 0.9 / p95 1.5,
  `tenant.work` p50 1.5 / p95 4.5, `tenant.commit` p50 0.6 / p95 0.8, and **2 tenant
  transactions per panel, every time** (the membership read the shell shares, then the
  panel's own). Client wall clock: p50 125.1 ms, p95 146.4 ms, all 200. Before this
  change the same opens took 3 (suppliers, orders) or 4 (products) transactions by
  inspection of the code, not by measurement.
  `getClaims` prerequisite, checked rather than assumed: the project publishes
  `/auth/v1/.well-known/jwks.json` (HTTP 200, `application/json`, one `EC` key,
  `alg: ES256`, kid starting `00efa8a1`), and the session's access token header is
  `alg: ES256` with the same kid — so tokens are genuinely asymmetric and
  `getClaims()` can verify locally instead of calling Supabase. Only the token header
  was decoded to establish that; the token itself was not read out or logged. The
  probe lives in `local/perf/check-jwks.ts` (untracked). Verified: `npm run check` 0
  errors (2 pre-existing warnings), unit 103/103, `test:db` 44/44, build clean with
  the three panel routes still dynamic, `secrets:check ok`. Not checked by hand in a
  browser; the measurement drove fetches from the signed-in tab.
- **2026-11-22 — Stage 3 item 4: one transaction per page, opened in one round trip (`b8bff2a`).**
  The products, inventory and purchase-orders pages each took a connection per
  read. Each page now calls one function that reads everything inside a single
  transaction (`getProductsPage`, `getInventoryPage`, `getPurchaseOrdersPage`), and
  the per-function wrappers take an optional client so a panel or a server action
  still works on its own. Opening a transaction is now one statement —
  `begin; set local role authenticated; select set_config('request.jwt.claims', …)` —
  instead of three round trips, with the claims inlined after the user id is checked
  against a UUID pattern (a parameter cannot be used in a multi-statement simple
  query, and a validated UUID cannot carry a quote). Re-measured with the same
  protocol as the baseline (fresh marker, 40 signed-in navigations, two batches of
  20):

  | layer            | before p50 / p95 | after p50 / p95 |
  | ---------------- | ---------------- | --------------- |
  | `tenant.connect` | 2.5 / 21.8       | 1.5 / 3.1       |
  | `tenant.setup`   | 15.2 / 111.8     | 4.8 / 11.6      |
  | `tenant.work`    | 5.6 / 100.3      | 3.9 / 110.7     |
  | `tenant.commit`  | 1.3 / 76.3       | 1.0 / 7.9       |
  | `proxy.auth`     | 89.3 / 623.0     | 53.8 / 432.0    |
  | `session.auth`   | 92.9 / 510.4     | 66.3 / 440.2    |

  Tenant transactions per page: p50 3 → 2 (range 1–3); the second is the shell's
  membership read (`getActiveBusiness`, React-cached and shared with the page).
  Client wall clock, same navigations: p50 333.9 / 213.2 before, 199.7 / 229.1
  after; p95 884.5 / 910.7 before, 938.9 / 796.8 after. Reading: the database's
  share of a page fell from roughly 69 ms to 22 ms at p50, and its tail from 112 ms
  to 11.6 ms per transaction setup; the auth rows moved without any code change on
  that path, so that difference is run-to-run noise, not an improvement. End-to-end
  p50/p95 sit inside the same noise, which is what a ~50 ms saving against a ~90 ms
  auth cost predicts. The report script's per-navigation total is gone (`f24f453`)
  because overlapping renders made it double-count. Verified: `npm run check` 0
  errors (2 pre-existing warnings), unit 103/103 across 20 files, `test:db` 44/44
  (RLS isolation unchanged with the one-statement setup), `npm run build` clean,
  `secrets:check ok`. Not checked by hand in a browser; the measurement drove
  fetches from the signed-in tab. Panel endpoints still take up to three
  transactions per open — the same change applies there.

- **2026-11-22 — Stage 3 baseline measured; instrumentation committed (`2b21ef8`).**
  `src/lib/nav-timing.ts` times three layers behind `NAV_TIMING=1` — the proxy's
  `auth.getUser()`, the page's `getSessionUser()`, and each `withTenant` split into
  connect / setup (begin + role + claims) / work / commit — and logs one line per
  sample. `npm run perf:nav -- <log> [--since=<epoch ms>]` turns those lines into
  p50/p95. With the flag unset the helper returns the callback untouched, so the
  committed path is unchanged. Method: restarted `next dev` on :51852 with
  `NAV_TIMING=1`, drove 40 authenticated navigations from the signed-in tab
  (`/`, `/products`, `/inventory`, `/suppliers`, `/purchase-orders`, 8 rounds of 5)
  with `fetch(..., { cache: "no-store" })` after a warm-up round, then read the log
  from a timestamp marker. Results (ms):

  | layer            | n   | p50  | p95   | max   |
  | ---------------- | --- | ---- | ----- | ----- |
  | `proxy.auth`     | 42  | 89.3 | 623.0 | 692.7 |
  | `session.auth`   | 41  | 92.9 | 510.4 | 544.3 |
  | `tenant.connect` | 114 | 2.5  | 21.8  | 118.7 |
  | `tenant.setup`   | 114 | 15.2 | 111.8 | 430.0 |
  | `tenant.work`    | 114 | 5.6  | 100.3 | 194.5 |
  | `tenant.commit`  | 114 | 1.3  | 76.3  | 182.1 |

  Client wall clock for the same navigations, measured in the page: p50 333.9 and
  213.2 in the two 20-navigation batches, p95 884.5 and 910.7. Median tenant
  transactions per render: 3. Reading: the two auth checks cost about 180 ms p50
  together and are bimodal — p95 near 0.5–0.6 s for a single check, which is the
  shape of a Supabase round trip (possibly a token refresh), not of local work. The
  database side is about 25 ms p50 per transaction and about 75 ms for a typical
  page, but `tenant.setup` alone reaches 112 ms p95 / 430 ms max, so the three
  statements that open a transaction are the DB component worth attacking first.
  Caveats: this is `next dev` on Windows against the Docker Postgres, so it is a
  development baseline, not the stage; the report's per-navigation total sums
  samples from layout and page renders that overlap, reads higher than the client's
  wall clock and is not used as the headline; unauthenticated requests log
  `proxy.auth` at ~0.3 ms (no cookie, no network), so only the signed-in path was
  measured. Next: item 3 and item 4 against this baseline, then `getClaims` only if
  the JWKS prerequisite holds.

- **2026-11-22 — The panels share one fetch body, and an opened panel announces itself.**
  `src/components/panel-loader.tsx` holds the loading/failed/ready body the four
  columns had each grown (`PanelLoader`), the panel-shaped skeleton, and the shared
  "not in this business" notice, so a column now only maps its payload to a panel.
  Opening renders one live region in `PanelGrid` (`"<label> opened"`), which is the
  whole announcement; the skeleton is `aria-busy` instead of a second live region, so
  a screen reader hears one sentence and not two. The unused `onNavigate` prop on
  `PanelLink` is gone. Covered by `tests/unit/panel-loader.test.ts` (2 cases: frame
  then payload; a failed request's retry fetches again). Verified: `npm run check` 0
  errors (2 pre-existing warnings), `npm run test` 103/103 across 20 files. Not
  checked with a screen reader: the announcement's wording and timing are unverified
  by ear, and no panel has been opened signed in.
  The three forms' Cancel links (`ProductForm`, `SupplierForm`, `PurchaseOrderForm`)
  now use `PanelLink` too, so cancelling closes the panel with a `replaceState`
  instead of a page render; `PanelLink` degrades to a normal link outside a provider,
  so a form rendered without one still works.
- **2026-11-22 — Every list panel opens without a page render, and Back closes it.**
  Inventory, suppliers and purchase orders joined products. Each screen has its own
  endpoint (`/api/inventory/panel`, `/api/suppliers/panel`,
  `/api/purchase-orders/panel`) that resolves the business from the session, validates
  the request with Zod and answers `private, no-store`; each page no longer fetches
  the panel's data (inventory drops `getInventoryDetail`, suppliers `getSupplier` and
  `listSuppliedProducts`, purchase orders `getPurchaseOrder`, `getOrderFormOptions`
  and the draft defaults). The order endpoint owns what the page used to compute: the
  draft editor's options and defaults, and a fresh receipt idempotency key per
  request. The shared panel request schema lives in `lib/panel.ts`; orders extend the
  idea with their own because `saved` there is a word (`ordered`, `cancelled`, …), not
  a boolean. History: opening a panel now pushes an entry and closing replaces it, so
  Back closes an open panel instead of leaving the screen, and a `popstate` listener
  puts the panel back in step with the address bar. Verified: `npm run check` 0 errors
  (2 pre-existing `_role`/`_action` warnings), `npm run test` 101/101 across 19 files
  (2 new: closing replaces rather than stacking an entry, and a popstate closes the
  panel), `npm run build` clean with the three new dynamic routes, `secrets:check ok`.
  Not verified in a browser: no panel has been opened, edited, ordered, received or
  archived signed in, and Back/Forward were only simulated in jsdom.
- **2026-11-22 — The product panel no longer re-renders the page.** A row click used
  to change `?product=` and re-render the route, which fetched the list, the
  categories and the suppliers again to open one panel. `PanelProvider` holds the
  panel's URL state and writes it with `history.replaceState`, which Next folds into
  the router without a server render; `PanelLink` takes over only an ordinary left
  click, so middle click, a new tab, no-JS and any screen without a provider stay
  ordinary links. The panel reads `/api/products/panel`, which resolves the business
  from the session and the active-business cookie — never the query string —
  validates the request with Zod and answers `private, no-store`. `products/page.tsx`
  no longer calls `getProduct` or `listSuppliers`, so a row click leaves the list
  query untouched. The open row is marked from the link's own state
  (`data-panel-active` plus a `:has` rule) because no server render moves it. Cost,
  accepted: on a reload or a shared link the panel now arrives in two steps, frame
  then data, instead of being in the first HTML. Verified: `npm run check` 0 errors
  (2 pre-existing `_role`/`_action` warnings), `npm run test` 99/99 across 19 files
  (3 new panel tests: a click opens without navigating and records the URL, a deep
  link starts open, closing returns to the list's own URL), `npm run build` clean
  with `/api/products/panel` among the dynamic routes, `secrets:check ok`. Not
  verified in a browser (no account password): no row click, deep link, edit, archive
  or save has been walked through, and inventory, suppliers and purchase orders still
  render their panels the old way.
- **2026-11-22 — Table-change loading on products and inventory.** A table change no
  longer raises the viewport bar; the table carries its own loading state.
  `ResultsBusy` (`src/components/results-busy.tsx`) wraps the list region with
  `aria-busy` and `data-busy`, and is driven by reporters rather than by guesswork:
  `LinkBusy` inside each pager control (`useLinkStatus`) and `TransitionBusy` in
  `FilterForm`. `FilterForm` asks whether a region encloses it (`useResultsRegion`)
  and drops its own sr-only "Updating results" when one does, so a filter apply is
  announced once on products and inventory; the suppliers and purchase-order bars
  have no region and keep announcing for themselves. While busy, `globals.css` hides `tbody[data-rows]` and reveals the
  `tbody[data-skeleton]` each table always renders, so the header, columns, filter
  bar and pager never move — the rows are replaced in place. `ProductTable` and
  `InventoryTable` render eight skeleton rows sized to their own columns (five for a
  viewer, six otherwise). Reports keeps option D: no skeleton and no bar, only the
  pager's "Loading page N…", because its four report tables have four shapes. The
  top bar remains for rail navigation, where there is no table to replace.
  Verified: `npm run check` 0 errors (2 pre-existing `_role`/`_action` warnings),
  `npm run test` 94/94 across 18 files (2 new: the region flips with its link and
  back, the table keeps its rows and skeleton in separate bodies), `npm run build`
  clean (10 routes, all dynamic), `secrets:check ok`, and the running dev server's
  compiled stylesheet contains both `data-busy`/`data-skeleton` rules. Not verified
  in a browser (no account password): how the swap reads on a throttled connection
  at 50 rows, with the pager below the fold, is unreviewed.
- **2026-11-22 — Pending state on the list pagers.** `Pagination`
  (`src/components/pagination.tsx`) replaces the three hand-written pagers on
  products, inventory and reports. Every control is still a `<Link>` to a real URL,
  so `/products?page=3` renders from the server on reload and nothing about the
  current page lives in client state; the addition is that `useLinkStatus` inside
  the anchor swaps the label to "Loading page 3…" (at the time it also raised the
  `RouteProgress` bar; the table-loading slice above removed the bar for table
  changes). A `searchParams` change has no other built-in feedback, because a
  resolved `loading.tsx` never re-fires. Verified: `npm run check`
  0 errors (2 pre-existing `_role`/`_action` warnings), `npm run test` 92/92 across 17
  files (4 new pagination tests: single page renders nothing, neighbour hrefs,
  end-of-range controls omitted, pending label and bar), `npm run build` clean (10
  routes, all dynamic), `secrets:check ok`. A first pass removed the `next/link`
  import from the reports page and missed a second `<Link>` further down it; lint
  caught it (`react/jsx-no-undef`) and the build repeated it (`TS2304`), the import
  was restored and all four gates re-ran on the fixed tree. Not verified in a
  browser (no account password): neither the pending label nor the bar has been
  seen on a throttled connection.
- **2026-11-22 — Loud pending state on `feat/navigation-loading-feedback`.** A route
  click now paints `RouteProgress` — a 3px indeterminate accent bar fixed to the top
  of the viewport — in the same frame as the click, because a destination's
  `loading.tsx` cannot paint until that route's first bytes arrive. The reason the
  skeleton arrived late on a throttled `next dev` session: Next 16 disables viewport
  prefetching in development (`links.js`, "compiling the target page"), so the click
  is always a cold round trip and the skeleton commits only when the stream starts.
  The bar is driven by `useLinkStatus` inside `NavPending` and by `FilterForm`'s
  transition; it is `aria-hidden` (the destination's `LoadingAnnouncement` carries
  the announcement) and becomes a static segment under `prefers-reduced-motion`.
  Verified: `npm run check` 0 errors (2 pre-existing `_role`/`_action` warnings),
  `npm run test` 88/88 across 16 files (2 new route-progress tests; nav-pending now
  also asserts the bar), `npm run build` clean (10 routes, all dynamic in this
  build's output, proxy middleware present), `secrets:check ok`. Not verified in a
  browser: still no account password, so the bar's visibility and its timing on a
  throttled connection are unreviewed. The `getClaims` work is recorded in
  `src/proxy.ts` and `docs/known-limitations.md` ("Navigation latency") and is not
  implemented.
- **2026-11-22 — Navigation feedback (Stage 1) on `feat/navigation-loading-feedback`.**
  Three commits, one per slice. Products, inventory, suppliers and purchase orders
  now have their own `loading.tsx` built from `PageSkeleton`,
  `ListHeaderSkeleton`, `FilterBarSkeleton` and `TableSkeleton`, so a route change
  paints that screen's header, filter bar and table shape instead of the
  dashboard-shaped group fallback. `NavPending` renders a dot inside each rail link
  while `useLinkStatus` reports the navigation pending. The four filter bars now
  submit through `FilterForm`, which pushes the same URL with
  `router.push(url, { scroll: false })` inside a transition and keeps `method="get"`
  and `action` as the pre-hydration fallback, so applying a filter no longer
  reloads the document. Verified: `npm run check` 0 errors (the 2 pre-existing
  `_role`/`_action` warnings), `npm run test` 86/86 (7 new: five filter-form, two
  nav-pending), `npm run build` clean with all 8 app routes dynamic and
  `/sign-in` static, `secrets:check ok`. Not verified: any of it in a browser —
  the local and stage apps need the Supabase account password, which is not held
  here — so the skeletons and the pending dot have had no visual review, and no
  navigation timing was taken on the stage. Stage 2 (static chrome outside the
  page's awaits, a panel boundary so a row click stops re-rendering the list) and
  Stage 3 (measure the auth round trip, then `getClaims`, the count inside the list
  query, one transaction per page) are not started; the `getClaims` prerequisite —
  asymmetric JWT signing keys and a published JWKS — is recorded in `src/proxy.ts`
  and `docs/known-limitations.md` under "Navigation latency".
- **2026-11-22 — Migration `0007` applied to hosted Supabase under Gate D.** Pre-flight, read-only: 7 tracked with `0006` newest; `has_schema_privilege('authenticated','public','USAGE')` true and `CREATE` false; `public` owned by `pg_database_owner` with `authenticated=U` already in its ACL; 2 businesses, 220 products, 219 movements, 2 orders. `npm run db:migrate:hosted` printed `applied 1 migration(s), 8 tracked in total` (switched to session mode 5432, auth shim skipped). Post-checks: 8 tracked with newest `1795344385254` (`0007`), USAGE true, CREATE still false, ACL unchanged (the grant added nothing because Supabase already provides it), every count unchanged. Second run: `applied 0 migration(s), 8 tracked in total`. Stage UI sign-in and `test:db` against hosted deliberately not run: the migration only adds a privilege Supabase already had.
- **2026-11-22 — Schema-wipe recovery is a committed migration (`0007`).** `0007_public_schema_usage.sql` grants `USAGE` on schema `public` to `authenticated` (journal entry 7), so a wiped local database no longer depends on a hand-run grant. Proved on a wiped schema: `public` recreated with an empty ACL left `has_schema_privilege('authenticated','public','USAGE')` false, `npm run db:migrate` applied 8 migrations and set `{app=UC/app,authenticated=U/app}`, `npm run test:db` passed 44/44 with no manual grant, and a second `db:migrate` applied 0. Demo data restored with `db:seed` (2 businesses, 220 products, 219 movements, 2 orders) and `db:link-user`; SQL re-checked 60/9 cafe, 160/6 retail, $4,505.30 at cost, 1 open order, $131.80 on order. Gates: lint 0 errors (2 pre-existing warnings), typecheck clean, `npm run test` 79/79, `npm run build` clean, `secrets:check ok`; `prettier --check .` fails only on the generated, untouched `next-env.d.ts` (CRLF in this working copy). Hosted Supabase is still at 7 tracked migrations until `db:migrate:hosted` runs.
- **2026-11-22 — Deployment verified on the Vercel stage.** Supabase redirect allowlist confirmed for `http://localhost:25000/**` and `https://inventory-stage.vercel.app/**`; `main` (through `e50688a`) pushed and deployed successfully; a signed-in re-check on the stage returned the seeded baseline — 60 products, 9 suppliers, 1 out / 1 low, $4,505.30 at cost, 1 open order, $131.80 on order. Reported by the user; not re-observed from this machine. `npm run test:db` 44/44 after restoring the `public` schema grant (see known limitations); other gates `Not run` for this docs-only update.

- **2026-11-22 — Demo walkthrough approved; demo will be hosted.** User approved `local/phase-6/demo-walkthrough.html` and chose the extend-seed/reset option for hosted data. Next is deployment verification: redirect allowlist, redeploy, stage auth re-checks.
- **2026-11-22 — Hosted demo data path built and verified.** `db/seed-hosted.ts` (`db:seed:hosted`) loads the same Demo Cafe/Retail baseline onto Supabase without touching `auth.users` (ids passed as args, verified before writing; loopback refused; opening movements recorded as the linked owner). Applied the 3 pending hosted migrations (7 tracked), seeded with `owner@cafe.test` owning both businesses: 2 businesses, 2 memberships, 220 products, 219 opening movements, 2 purchase orders. Hosted figures equal the script baseline (60 products, $4,505.30, 1 out / 1 low, 1 open order, $131.80 on order; Pork belly then Cocoa; PO-0001 ordered, PO-0002 draft; retail 160/6/0). Gates: typecheck 0 errors, eslint clean on the new file, prettier clean, unit 79/79, production build clean, `secrets:check ok` (full `npm run check`/`test:db` not re-run; change is additive and hosted-only). Review deduped the shared catalogue/order/count SQL into `db/seed-shared.ts` (both seeds use it; stale "arrives with Phase 5" notes now point at `db:seed:hosted`); re-verified after the dedupe: typecheck 0 errors, eslint clean on all three seed files, prettier clean, unit 79/79, `db:seed` and `db:seed:hosted` both re-run idempotent with identical counts, production build clean, `secrets:check ok`.
- **2026-11-22 — Demo walkthrough dry run on a freshly reset local database (uncommitted).** Wiped `public` + `drizzle` tracking, `db:migrate` applied 7, `db:seed` reported `2 businesses, 3 demo users, 3 memberships, 220 products, 219 opening movements, 2 purchase orders`, re-linked `owner@cafe.test` to both businesses. SQL as owner confirmed the script baseline (Demo Cafe 60 products, 9 suppliers, 1 out / 1 low, $4,505.30 at cost, 1 open order, $131.80 on order; Pork belly 0/2 first, Cocoa CAF-040 1 ea/1 low; Tomatoes CAF-001 18 kg; PO-0001 ordered 12/20/3 @ 4.20/2.60/9.80; Settings 60/9/9/2/59/0; retail 160/6/0). Dev-server routes `/`, `/products`, `/suppliers`, `/inventory`, `/purchase-orders`, `/settings` all 307 to sign-in (auth guard, correct). Fixed `local/phase-6/demo-walkthrough.html`: 59 movements exact, Low-or-out handoff to Stop 4, cocoa CAF-040 / $15.20 each with no product-panel ledger, supplier panel carries no order history (PO-0001 lives on `/purchase-orders`), UI status labels (Partly received / Received), full over-receipt quote, exact not-in-business quotes, reset text includes categories, troubleshooting 60-product baseline. Gates `Not run` (local-only HTML, no app code changed). Remains before the demo is ready: walkthrough review/approval, then deployment verification (hosted data path, redirect allowlist, redeploy, stage auth re-checks).
- **2026-11-22 — Phase 6 empty, loading and error states; demo switching.**
  Empty states: a no-match search on products, suppliers, inventory and purchase
  orders each rendered its own copy and a Clear filters control (“No products
  match those filters”, “No suppliers match those filters”, “No orders match
  those filters”; screenshot `local/phase-6/empty-products.png`), and the stock,
  movement and order-status reports did the same while keeping the export link.
  Loading: with `products` locked inside a transaction, a client navigation to
  Products showed the route skeleton under the live shell — `aria-busy="true"`,
  the screen-reader announcement “Loading page”, and the business switcher still
  usable (`local/phase-6/loading-products-skeleton.png`); releasing the lock
  resolved to 62 products. Error: revoking `select` on `products` from
  `authenticated` produced a page-level failure and the app's own panel, “This
  screen could not load” with a Try again button, inside the shell
  (`local/phase-6/error-page-boundary.png`); the grant was restored immediately.
  Stopping Postgres instead failed in `listBusinesses` inside the layout, which
  sits above that boundary: the browser got Next's generic “This page couldn’t
  load / Reload” page with no shell or nav (plus the dev overlay), not the app's
  error panel (`local/phase-6/error-db-down.png`); the container was restarted and
  the page recovered after a reload. Unknown routes (`/dashboard` — the dashboard
  lives at `/`) show Next's unstyled default 404 with no shell
  (`local/phase-6/error-unknown-route-404.png`). D4 (default 404) is fixed with a
  styled `src/app/not-found.tsx` that offers the dashboard and products; D5
  (layout failures bypass `error.tsx`) is fixed with a root boundary
  `src/app/error.tsx` above the shell layout, verified by stopping Postgres:
  `/products` showed the shared panel with Try again instead of Next's page
  (`local/phase-6/error-root-panel.png`), and a reload once Postgres was back
  returned 62 products. That retry itself failed after the restart and only a
  reload recovered, which is logged as an open limitation. Not verified:
  whether Try again recovers without a reload, because the automated tab reports
  `document.visibilityState: hidden` and pauses the streamed reveal; the reload
  that flushed the queue returned 62 products. No data changed: the revoked grant
  was restored and the container is running. Demo switching: `db:link-user` now
  accepts `both` and defaults to it, linking the Supabase user to Demo Cafe and
  Demo Retail in one run; rerunning it for `owner@cafe.test` made the selector
  offer both without SQL, and switching moved 62 cafe products to 160 retail and
  back with no cross-business row. Gates after the script change: `check` 0 errors
  (2 pre-existing `_role`/`_action` warnings), unit 79/79 across 13 files, DB
  44/44, build clean, `secrets:check ok`.
- **2026-11-22 — Phase 6 tenant isolation walk, no defects.** Signed in as
  `owner@cafe.test`. The account is a member of Demo Cafe only, so foreign ids
  were tried first without any access to Demo Retail: `/products?product=` with
  a retail product id, `/suppliers?supplier=` with a retail supplier id and
  `/inventory?product=` with the same product id each rendered the neutral "not
  in this business" panel, and no retail name, SKU or cost appeared anywhere on
  the page (screenshot `local/phase-6/isolation-product-foreign.png`). A random
  order id on `/purchase-orders?order=` gave the same neutral "That order is not
  in this business" panel. To walk the switch itself, a temporary `owner`
  membership in Demo Retail was added for the seed's retail business, because
  the selector only lists businesses the user belongs to; the page then offered
  both. Switching to Demo Retail moved every screen to retail data (160 products
  with `RET-` SKUs, 6 suppliers, 0 orders, $0.00 on order, no `CAF-` or Journey
  rows; `local/phase-6/isolation-retail-switched.png`), and while it was active
  the cafe product, supplier and PO-0003 ids each returned "not in this
  business" with no cafe row or value on screen. Switching back restored 62
  products and 10 suppliers with no retail row, and the cafe's own PO-0003 still
  opened normally, so the refusals are tenant-specific rather than a broken
  lookup. The temporary membership was deleted afterwards: the selector lists
  Demo Cafe only again, and the retail ids are refused as before. No defect was
  found; the only caveats are that a business cannot be selected without a
  membership (by design, `listBusinesses`), and Demo Retail has no purchase
  orders, so the foreign-order attempt could only run in the retail→cafe
  direction.
- **2026-11-22 — Phase 6 journey pass, with D1 and D2 fixed.** Walked the four
  core journeys in the preview as `owner@cafe.test`, checking Postgres after each
  step. Products: created JRN-001 with cost, sell and reorder level, edited name
  and cost, archived (61→60 with a notice), restored (60→61); a duplicate SKU was
  refused and a 120-character limit was enforced. Suppliers: created Journey
  Produce Co (9→10), edited contact and phone, archived (10→9, hidden from the
  list), restored (9→10), and its product filter in the order editor listed only
  its own product. Stock: +5 in, −2 out, an adjustment without a reason refused,
  then +1 adjustment; the ledger read 5/−2/+1 summing 4, with value at cost
  moving 19.00 → 11.40 → 15.20. Purchasing: PO-0003 drafted at 38.00, marked
  ordered, an over-receipt of 12 refused ("Only 10 kg … is outstanding"), a
  partial 6 posted one receipt and left it partly received, a duplicate submit
  from a stale second tab was refused, and the final 4 closed it at 10/10 with
  two delivery lines and no double count (ledger sum 14, two receipt lines).
  Three defects were logged with screenshots and field read-backs rather than
  fixed mid-pass: D1, both forms blanked after a rejected save
  (`local/phase-6/journey-product-form-reset.png`); D2, the movement select read
  "Stock in" beside an adjustment's direction field
  (`local/phase-6/journey-adjustment-reset.png`); D3, a stale "saved" notice
  stayed on screen through archive and restore. All three are now fixed: D1 and
  D2
  are fixed in `0ef1b41` (product and supplier fields held in state) and
  `b368be9` (held select values re-applied after React's post-action reset),
  each with a jsdom test that failed on the old code first — `expected '' to be
'Journey Apples'`, and `expected 'stock_in' to be 'adjustment'`. Both fixes
  were re-checked in the browser on the same screenshots
  (`local/phase-6/supplier-form-retained.png`,
  `local/phase-6/movement-form-retained.png`). D3 is fixed in `1219908`: archive
  and restore submit through `src/components/archive-form.tsx`, which clears the
  one-shot `saved` flag from the URL after the action, so the notice no longer
  sits over the new state while filters, page and the open panel stay put. Four
  jsdom tests in `tests/unit/archive-notice.test.ts` cover archiving and
  restoring a product, archiving a supplier, and the no-op when no notice is
  present; three of them fail against the old panels (`expected "vi.fn()" to be
called with arguments: ['/products?product=p1']`). Walked in the browser on
  Journey Apples and Journey Produce Co: the banner showed before the action and
  the URL lost `saved=true` afterwards, with the archived or restored state in
  its place; both rows were left unarchived. Gates after all three fixes: `check`
  0 errors (2 pre-existing `_role`/`_action` warnings), unit 79/79 across 13
  files, DB 44/44, build clean, `secrets:check ok`. The journey rows were left in the
  local database for inspection; the Settings reset restores the seeded baseline.
  Not verified: tenant isolation and empty/error states in the browser, real-mouse
  interaction on a few buttons (the automated tab reports
  `document.visibilityState: hidden`), and the retail business (only the cafe
  account is linked).
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
