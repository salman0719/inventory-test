# Phase 3: Architecture and data design (Gate C review pack)

- **Date:** 2026-11-21
- **Status:** Approved at Gate C on 2026-11-21
  (`docs/decisions/0007-gate-c-approval.md`). Nothing here is implemented.
- **Scope:** Implements the decisions in `0004-gate-a-scope.md` (one purchase order
  per supplier with outstanding lines, stock-on-order, staff mobile) and
  `0005-stack-hybrid-supabase.md` (Supabase Postgres and Auth, Drizzle schema and
  migrations, RLS as the isolation mechanism).

Read this with `docs/database-schema.md`, which remains the guidance document; this
pack resolves the questions it leaves open.

---

## 1. Current state, verified

What exists today, checked in this repository. This is the snapshot taken at the
Gate C review; §13 records what Phase 4 changed.

- Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4. One route, `/`,
  with no auth, no data access, no domain modules.
- `db/schema.ts` holds four placeholder tables — `tenants`, `users`,
  `memberships`, `audit_events` — referenced by no application code.
- `db/migrations/` is empty, and no `drizzle.config.ts` exists.
- `drizzle-kit` is **not installed** (`package.json` has `db:generate` pointing at
  it; `package-lock.json` has no entry). `npm run db:generate` cannot work.
- `db/migrate.ts` and `db/seed.ts` are stubs that print a line and exit 0.
- CI runs `npm run db:migrate`, which therefore passes without touching a database.
- `docker-compose.yml` provides Postgres 17, Mailpit and (profiled) Adminer.
- `src/lib/permissions.ts` has `can()` returning `false`; `tenant-context.ts` is a
  Zod contract only.

Consequence: the database story is scaffolding, not infrastructure. Phase 4 must
make migrations real before any schema below can be reviewed as code.

## 2. Architecture

```
Browser (React Server Components + client islands)
   │  session cookie (Supabase Auth, @supabase/ssr)
   ▼
Next.js server (Node runtime on Vercel)
   ├── server actions / route handlers   ← Zod validation at every boundary
   ├── lib/db.ts  withUser(userId, fn)   ← one transaction per request unit
   │       BEGIN; SET LOCAL ROLE authenticated;
   │       SET LOCAL request.jwt.claims = '<jwt claims>'; ... COMMIT
   ├── Postgres functions (SECURITY DEFINER, pinned search_path)
   │       receive_purchase_order(...), record_stock_movement(...)
   └── Supabase Storage (signed URLs, server-issued)
   │
   ▼
Postgres 17 (Supabase hosted; compose locally)
   RLS on every business-owned table, policies keyed on auth.uid()
```

Boundaries:

- No separate API service. Mutations are server actions; route handlers only where
  a raw HTTP surface is required (storage upload, future webhooks).
- The browser never receives a service-role key, a database URL, or any
  privileged credential. It holds the anon key and its own session, per `0005`.
- The active business id is a UI preference, never a trust boundary. Every query
  is scoped by the database, not by the id the client sent.
- All multi-row writes (receiving, adjustments, order creation) happen inside one
  transaction, in a Postgres function or a `withUser` transaction.

## 3. Data model

Types: `uuid` keys (`gen_random_uuid()`), `timestamptz` for instants, `date` for
delivery dates, `numeric(12,2)` for money, `numeric(12,3)` for quantities so
kilograms and litres work, `text` units from a small controlled set.

Every business-owned table carries `business_id`, and parent references are
**composite** — `(business_id, parent_id)` referencing `(business_id, id)` — so the
database itself rejects a line pointing at another tenant's product. This is
stronger than an application check and costs one extra unique index per parent.

### businesses

| column                 | type                               | notes                              |
| ---------------------- | ---------------------------------- | ---------------------------------- |
| id                     | uuid pk                            |                                    |
| name                   | text not null                      |                                    |
| business_type          | text not null                      | check in (`cafe`,`retail`,`other`) |
| currency_code          | char(3) not null default `AUD`     |                                    |
| created_at, updated_at | timestamptz not null default now() |                                    |

### business_members

| column      | type                               | notes                                  |
| ----------- | ---------------------------------- | -------------------------------------- |
| id          | uuid pk                            |                                        |
| business_id | uuid not null                      | fk → businesses, on delete cascade     |
| user_id     | uuid not null                      | fk → auth.users(id), on delete cascade |
| role        | text not null                      | check in (`owner`,`staff`,`viewer`)    |
| created_at  | timestamptz not null default now() |                                        |

Unique `(business_id, user_id)`; index on `user_id` (every policy looks it up).

### categories, suppliers

`categories(id, business_id, name, created_at)`, unique `(business_id, lower(name))`.
`suppliers(id, business_id, name, contact_name, email, phone, address, notes,
is_archived, created_at, updated_at)`, index `(business_id, name)`.

### products

`id`, `business_id`, `category_id` (null), `supplier_id` (null), `name` not null,
`sku` not null, `description`, `unit_of_measure` not null default `ea`,
`cost_price` numeric(12,2) not null default 0 check ≥ 0, `selling_price` numeric(12,2)
null, `reorder_level` numeric(12,3) not null default 0 check ≥ 0, `image_path` null,
`is_archived` bool not null default false, timestamps.

- Unique `(business_id, sku)`; SKUs stored upper-cased at the boundary.
- FKs to `categories` and `suppliers` are composite on `business_id`, both
  `on delete restrict` (archive instead of delete).
- **One supplier per product**, nullable. No `product_suppliers` table: nothing in
  the approved scope needs multi-supplier products, and the brief warns against
  over-modelling.
- Index `(business_id, is_archived, name)`, and `(business_id, supplier_id)`.

### stock_movements (the ledger — append only)

| column         | type                               | notes                                                               |
| -------------- | ---------------------------------- | ------------------------------------------------------------------- |
| id             | uuid pk                            |                                                                     |
| business_id    | uuid not null                      |                                                                     |
| product_id     | uuid not null                      | composite fk → products                                             |
| movement_type  | text not null                      | check in (`opening`,`received`,`stock_in`,`stock_out`,`adjustment`) |
| quantity_delta | numeric(12,3) not null             | check ≠ 0; signed                                                   |
| reason         | text                               | required for `adjustment`                                           |
| reference_type | text null                          | `purchase_order`, `purchase_receipt`, `manual`                      |
| reference_id   | uuid null                          |                                                                     |
| unit_cost      | numeric(12,2) null                 | cost at time of movement                                            |
| created_by     | uuid null                          | fk → auth.users(id)                                                 |
| created_at     | timestamptz not null default now() |                                                                     |

Index `(business_id, product_id, created_at desc)` and `(business_id, created_at desc)`.

No `updated_at`, no `deleted_at`: corrections are new movements. `UPDATE` and
`DELETE` are revoked from the application role.

### purchase_orders

`id`, `business_id`, `supplier_id` (composite fk), `order_number` text not null,
`status` text not null default `draft`, `ordered_at` timestamptz null,
`expected_delivery_at` date null, `notes`, timestamps.

- Unique `(business_id, order_number)`.
- Status check in (`draft`,`ordered`,`partially_received`,`received`,`cancelled`).
- **Partial unique index** `(business_id, supplier_id) where status in
('draft','ordered','partially_received')` — one open order per supplier, which is
  how Gate A's "no split POs" rule is enforced rather than merely intended.

### purchase_order_lines

`id`, `business_id`, `purchase_order_id` (composite fk), `product_id` (composite
fk), `quantity_ordered` numeric(12,3) check > 0, `received_quantity` numeric(12,3)
not null default 0 check ≥ 0 and ≤ `quantity_ordered`, `unit_cost` numeric(12,2)
not null, timestamps. Unique `(purchase_order_id, product_id)`.

`received_quantity` is a maintained cache for fast lists; the receipt lines remain
the truth and Phase 6 includes a reconciliation query.

### purchase_receipts / purchase_receipt_lines

`purchase_receipts(id, business_id, purchase_order_id, received_at timestamptz not
null default now(), notes, received_by, idempotency_key uuid not null)` with unique
`(business_id, idempotency_key)`.

`purchase_receipt_lines(id, business_id, receipt_id, purchase_order_line_id,
quantity_received numeric(12,3) check > 0, unit_cost numeric(12,2))`.

### Derived stock, not stored stock

```sql
create view product_stock with (security_invoker = true) as
select p.id as product_id, p.business_id,
       coalesce(sum(m.quantity_delta), 0) as on_hand
from products p
left join stock_movements m on m.product_id = p.id
group by p.id, p.business_id;
```

`security_invoker = true` (Postgres 15+, we run 17) means the view obeys the
caller's RLS instead of the definer's. No cached quantity column in the MVP: at 160
products the aggregate is trivial, and a cache is another thing that can disagree
with the ledger. Stock-on-order is likewise derived by summing open order lines.

## 4. Tenant isolation and RLS

Two helper functions, both `stable`, `security definer`, `search_path` pinned to
`public, pg_temp`:

```sql
create function private.is_member(b uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from business_members m
    where m.business_id = b and m.user_id = auth.uid()
  );
$$;
```

and `private.has_role(b uuid, roles text[])` for owner/staff-only writes.

Policy shape, one home per intent:

| Table                                     | select                           | insert                              | update                                          | delete         |
| ----------------------------------------- | -------------------------------- | ----------------------------------- | ----------------------------------------------- | -------------- |
| businesses                                | `private.is_member(id)`          | none (service role)                 | owner                                           | none           |
| business_members                          | `private.is_member(business_id)` | owner                               | owner                                           | owner          |
| categories, suppliers, products           | `private.is_member(business_id)` | owner, staff                        | owner, staff                                    | none (archive) |
| purchase_orders, purchase_order_lines     | `private.is_member(business_id)` | owner, staff                        | owner, staff (draft only, enforced in function) | none           |
| purchase_receipts, purchase_receipt_lines | `private.is_member(business_id)` | **no direct grant** — function only | none                                            | none           |
| stock_movements                           | `private.is_member(business_id)` | **no direct grant** — function only | none                                            | none           |

RLS is enabled on every table above; default is deny with no policy. A policy is
not a grant: the role also needs table privileges, and a table with a policy but
no grant fails with `permission denied`. The local smoke test caught exactly that
on `purchase_orders`, which is why §9 tests grants alongside policies.

Deliberate consequences:

- A user authenticated to Supabase but with no membership sees zero rows, not an
  empty app with errors: 0 rows is the correct, quiet answer.
- `authenticated` gets `select` plus narrow `insert`/`update` grants on catalogue
  tables, and **no write grant at all** on the ledger or receipts. The only way to
  write stock is a function that validates.
- The service role bypasses RLS and is used only by local seed scripts. It is never
  constructed on a request path.

**The connection role is the load-bearing detail.** Drizzle connects directly, so
RLS is only real if the request runs as a role without `BYPASSRLS`. Every request
unit goes through `withUser`:

```ts
// lib/db.ts
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '<claims json for this session>';
-- queries
COMMIT;
```

Migrations and seeds connect as the owner role (this is the same distinction
Supabase's pooler makes when it hands out `authenticated` connections). A test
asserts that request-path code never uses the owner connection, and a second test
asserts a business A user reading business B's product gets 0 rows — including
through `product_stock`.

**Verified locally, 2026-11-21.** The DDL in this pack was applied to PostgreSQL
17.12 in the compose container, in a scratch database, with assertions. Results:
a cross-business category reference was rejected by the composite foreign key; a
second open order for the same supplier was rejected by the partial unique index
(a cancelled one was allowed); a `received_quantity` above `quantity_ordered` was
rejected; user A saw exactly 1 product, 1 movement, 1 stock row and their own 2
orders; user B saw 1 product, 0 orders and 0 rows of A's stock; a user with no
membership saw 0 products; `product_stock` with `security_invoker` obeyed the
caller's RLS.

Not verified, because it is not implemented: the receiving function body,
concurrent receiving, idempotent replay, and storage bucket policies. Those are
Phase 5 work with Phase 6 tests.

### Local development without Supabase

`auth.uid()` reads the `sub` claim from `request.jwt.claims`. A **development-only**
migration creates the `auth` schema, a minimal `auth.users(id uuid)` for the foreign
keys, and:

```sql
create function auth.uid() returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;
```

Note the explicit `::uuid`: `->>` yields `text`, and Postgres rejects a `text`
body for a function declared to return `uuid`. This was caught by running the
schema against local Postgres, not by reading it.

This mirrors Supabase's own definition, so the policy SQL is identical in both
places; only the JWT source differs. It is applied to compose Postgres and never to
a hosted project, guarded by an explicit `APP_ENV=local` check in the migration
runner. Tests set claims per transaction with `SET LOCAL request.jwt.claims`.

## 5. Stock ledger design

- Append-only signed deltas. Types: `opening` (seed and stock-take), `received`
  (from receiving), `stock_in` / `stock_out` (manual), `adjustment` (correction,
  reason required).
- On hand is `sum(quantity_delta)` per product. Nothing writes a quantity to
  `products`.
- Corrections are compensating movements, never edits. A wrong receipt is reversed
  by an `adjustment` with a reason that references the receipt.
- Negative stock is prevented inside `record_stock_movement`, which locks the
  product row (`select … for update`), recomputes the sum and raises if the result
  would be below zero. This serialises per product and avoids the read-then-write
  race a trigger-free check would have.
- Money is `numeric`, never float; totals computed in SQL, and any total sent by a
  client is ignored in favour of recomputation.

## 6. Transactional receiving

```sql
create function app.receive_purchase_order(
  p_po_id uuid,
  p_lines jsonb,             -- [{ "purchase_order_line_id": uuid, "quantity": 2.5 }]
  p_idempotency_key uuid
) returns table (receipt_id uuid, status text)
language plpgsql security definer set search_path = public, pg_temp
```

Steps, all in one transaction:

1. Read the order; require `private.is_member(business_id)` and owner/staff role.
2. Idempotency: if `(business_id, idempotency_key)` already exists, return that
   receipt unchanged and write nothing. Concurrent duplicates collide on the unique
   index instead of double-posting.
3. Require status `ordered` or `partially_received`; drafts cannot receive.
4. `select … for update` on the order's lines ordered by id (stable lock order, no
   deadlock between two receivers).
5. Reject any quantity ≤ 0, any line not belonging to this order, and any quantity
   above outstanding. **Over-receipt raises an error**; it is not clamped, because
   `AGENTS.md` requires an explicitly approved rule before accepting more than was
   ordered. The UI pre-fills the outstanding quantity to make that rare.
6. Insert `purchase_receipts` + `purchase_receipt_lines`.
7. Insert one `stock_movements` row per received line (`received`, positive delta,
   `unit_cost` copied).
8. Update `received_quantity`; set status `received` when every line is complete,
   otherwise `partially_received`.
9. Return the receipt id and new status.

Status transitions, enforced here and in the order actions:

| From                         | To                            | Trigger                                       |
| ---------------------------- | ----------------------------- | --------------------------------------------- |
| draft                        | ordered                       | user marks ordered; `ordered_at` set          |
| draft                        | cancelled                     | user cancels                                  |
| ordered                      | partially_received / received | receiving function                            |
| partially_received           | received                      | receiving function                            |
| ordered / partially_received | cancelled                     | explicit cancel, with outstanding lines shown |

`record_stock_movement(product_id, movement_type, quantity_delta, reason)` follows
the same pattern for manual adjustments: membership and role check, product lock,
non-negative check, insert, return new on-hand.

## 7. Auth and storage

- Supabase Auth, email/password, reset by email, persistent cookie session via
  `@supabase/ssr`. No social, MFA, invitations or SSO, per the brief.
- Membership is `business_members`; the business selector lists the memberships the
  session user actually has, read under RLS.
- Protected routes: middleware refreshes the session; server components read the
  user and 404 (not 403) a business the user is not a member of, so existence is
  not leaked.
- Storage: private bucket `product-images`, object path
  `{business_id}/{product_id}/{uuid}.{ext}`. Upload is server-issued; the browser
  gets a signed upload URL or posts to a route handler. Read access uses short-lived
  signed URLs. A storage policy checks `private.is_member((storage.foldername(name))[1]::uuid)`
  so the bucket enforces the same tenant rule as the tables.
- Validate MIME type and size server-side; reject anything over 5 MB for the MVP.
  No attachments bucket until a real workflow needs it.

## 8. Environments and deployment

| Environment    | Database                  | Auth            | Notes                                        |
| -------------- | ------------------------- | --------------- | -------------------------------------------- |
| Local          | compose Postgres 17       | dev `auth` shim | full RLS exercised locally                   |
| CI             | postgres:17 service       | same shim       | migrations actually applied                  |
| Hosted dev     | Supabase project (Gate D) | Supabase Auth   | anon key in browser, service key server-only |
| Preview / demo | Vercel preview (Gate D)   | same project    | public URL only after approval               |

Env vars (names only; values never committed): `DATABASE_URL` (pooled, owner role
for migrations), `DATABASE_URL_APP` (authenticated role for request path if a
separate connection is used), `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only),
`APP_URL`. `.env.example` gains the new names at Gate D.

**No hosted resource exists and none will be created before Gate D.**

## 9. Testing plan

- **Unit (Vitest):** Zod boundary schemas, status-transition helpers, money and
  quantity formatting, permission matrix.
- **Database (Vitest + compose/CI Postgres):** run real migrations against a
  scratch database per run; fixtures for two businesses and two users. Cases:
  receiving full, partial, second partial to complete; over-receipt rejected;
  idempotent replay returns one receipt and one set of movements; two concurrent
  receipts cannot over-receive; negative stock rejected; cross-tenant reads return
  0 rows through tables, views and storage paths; a `staff` user cannot delete a
  product or edit an order after ordering.
- **E2E (Playwright):** sign-in, business switch, create product, adjust stock,
  create order, partial receive, verify on-hand and movement history. The existing
  `e2e/auth.spec.ts` is retargeted when auth lands; it currently asserts the shell.
- **CI order:** check → `db:migrate:ci` → `db:seed` twice → unit → database →
  build → perf → smoke + e2e. `db:migrate:ci` fails when it applies nothing, so the
  vacuous pass is gone.

## 10. Risks and mitigations

| Risk                                                    | Mitigation                                                                                                             |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| RLS silently bypassed because the app connects as owner | `withUser` sets `authenticated` + claims per transaction; test fails if the owner connection is used on a request path |
| Policy gaps on a new table                              | default deny; a test enumerates tables and asserts RLS is enabled and at least one policy exists                       |
| Double-posted receipt from a double click               | idempotency key + unique index; UI disables the button while pending                                                   |
| Over-receipt                                            | rejected in the function, not clamped; Phase 6 test                                                                    |
| Ledger drift from the cached `received_quantity`        | reconciliation query in Phase 6; receipts are the truth                                                                |
| Dense Direction C UI excludes casual staff              | 13 px floor, visible close, optional shortcuts, 44 px targets; Phase 6 phone test                                      |
| Money rounding                                          | `numeric` end to end, totals recomputed server-side                                                                    |
| Migration tooling is fake today                         | Phase 4 prerequisite, below                                                                                            |

## 11. Prerequisites before Phase 4 work (all completed 2026-11-21)

1. Add `drizzle-kit` and a `drizzle.config.ts`; `db:generate` must emit into
   `db/migrations`.
2. Replace the `db/migrate.ts` and `db/seed.ts` stubs with real runners that apply
   committed SQL in order, are idempotent, and exit non-zero on failure.
3. Make the CI migration step fail when it applies zero migrations.
4. Retire the placeholder `tenants`/`memberships`/`users` tables in `db/schema.ts`
   in favour of the schema above, in one migration, before any feature code.

All four were completed on 2026-11-21; what the implementation changed is in §13.

## 12. Decisions approved at Gate C

All ten were accepted as recommended on 2026-11-21; the record, and the resolved
questions below, are in `docs/decisions/0007-gate-c-approval.md`.

| ID   | Decision                                                                                                     | Outcome                                              |
| ---- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| DC1  | Naming: `businesses` / `business_members`, retiring the `tenants` placeholders                               | Adopt; matches the product language and the brief    |
| DC2  | Stock derived from the ledger with no cached column                                                          | Adopt; simpler and cannot disagree with the ledger   |
| DC3  | One open purchase order per supplier enforced by a partial unique index                                      | Adopt; implements the Gate A rule in the database    |
| DC4  | Over-receipt rejected with an error                                                                          | Adopt; matches `AGENTS.md`                           |
| DC5  | Ledger and receipts writable only through `security definer` functions; request path runs as `authenticated` | Adopt; the only combination where RLS is real        |
| DC6  | Local `auth.uid()` shim instead of requiring the Supabase CLI to develop                                     | Adopt; keeps compose and CI working, same policy SQL |
| DC7  | Money `numeric(12,2)`, quantities `numeric(12,3)`                                                            | Adopt                                                |
| DC8  | Status model and transitions as tabled in §6                                                                 | Adopt                                                |
| DC9  | Private product-image bucket with signed URLs                                                                | Adopt; tenant isolation beats convenience            |
| DC10 | Single stock location (no `inventory_locations`)                                                             | Adopt; nothing in scope needs more                   |

Resolved questions:

- **Viewer and money.** Viewers see quantities, never cost or stock value. RLS is
  row-level, so this is enforced in the query layer and by rejecting the role on
  cost endpoints; Phase 5 tests that no monetary field reaches a viewer.
- **Split deliveries.** One open order per supplier stands: a delivery split across
  weeks is the same order received twice, and outstanding lines carry it. Only two
  simultaneous orders are blocked, and the UI offers the existing order instead.
- **CSV.** Export stays in the MVP (read-only, no new validation surface). Import
  moves to post-MVP, where it gets duplicate-SKU handling, unit parsing, partial
  failure reporting and a dry run.

## 13. Phase 4 implementation notes (2026-11-21)

The local half of Phase 4 is built: `drizzle-kit` with a real `drizzle.config.ts`,
three committed migrations, working `db:migrate` and `db:seed` runners, an idempotent
seed, and a CI gate that fails when nothing is applied. No hosted resource was
created.

Four things did not survive contact with the database, recorded so the contract
matches the code:

- **The helper schema is `private`, not `app`.** Compose and CI connect as the `app`
  user, and Postgres resolves unqualified names through `"$user", public`. Creating a
  schema named `app` made later unqualified objects land in it: `product_stock` was
  created in schema `app` instead of `public`. The schema is now `private` and the
  view is explicitly `public.product_stock`.
- **drizzle-kit emits foreign keys before the unique indexes they depend on.** The
  composite `(business_id, id)` keys failed with `transformFkeyCheckAttrs` until the
  generated migration was reordered: tables, then indexes, then constraints. Future
  composite keys need the same ordering.
- **compose does not read `.env.local`.** `new:ports` writes a random database host
  port there, but compose interpolates `.env`, so the database was published on 4432
  while `DATABASE_URL` said 25002. `npm run db:up` passes `--env-file .env.local`.
- **The seed is deliberately narrow.** It creates two businesses, three demo users
  and their memberships, idempotently, and refuses to run against a hosted database.
  Catalogue rows arrive in Phase 5 with the UI that reads them.

Verified on 2026-11-21 against PostgreSQL 17 in compose: a fresh migrate applies 3
migrations and exits 0; a second run applies 0 and exits 0; `db:migrate:ci` on a
current database exits 1; the seed run twice reports 2 businesses, 3 users and 3
memberships both times; `public` holds 10 tables and the view; `tenants`,
`memberships`, `users` and `audit_events` are absent; 24 policies exist across the 10
tables; a cafe owner sees 1 business and 0 rows of Demo Retail; a direct
`stock_movements` insert as `authenticated` is denied with `permission denied`.
