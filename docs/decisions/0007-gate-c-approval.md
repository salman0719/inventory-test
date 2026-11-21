# 0007 Gate C approval: architecture and schema

- **Date:** 2026-11-21
- **Status:** Accepted
- **Context:** `docs/plans/phase-3-architecture.md` sets out the architecture, schema,
  RLS and tenant isolation, stock ledger, receiving transaction, auth and storage,
  environments, testing plan and risks, with ten decisions (DC1–DC10) and three open
  questions. The proposed DDL was applied to PostgreSQL 17.12 in a scratch database
  with assertions before review; cross-tenant foreign keys, the one-open-order
  index, the over-receipt constraint, `security_invoker` on the stock view and RLS
  visibility for two members and one non-member all behaved as described.
- **Decision:** Approve the pack. All ten decisions are accepted as recommended, and
  the three open questions are resolved below.
- **Approved by:** Project owner, 2026-11-21.

## Accepted decisions

| ID   | Decision                                                                                                                                                    |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DC1  | `businesses` / `business_members` replace the unused `tenants` / `memberships` placeholders                                                                 |
| DC2  | Stock derived from the ledger by view; no cached quantity column                                                                                            |
| DC3  | One open purchase order per supplier, enforced by a partial unique index                                                                                    |
| DC4  | Over-receipt is rejected with an error, never clamped                                                                                                       |
| DC5  | Ledger and receipt writes only through `security definer` functions; the request path runs as `authenticated` with `request.jwt.claims` set per transaction |
| DC6  | Local `auth.uid()` shim over compose Postgres rather than requiring the Supabase CLI                                                                        |
| DC7  | Money `numeric(12,2)`, quantities `numeric(12,3)`                                                                                                           |
| DC8  | Status model and transitions as tabled in the pack                                                                                                          |
| DC9  | Private `product-images` bucket with short-lived signed URLs                                                                                                |
| DC10 | Single stock location; no `inventory_locations`                                                                                                             |

## Resolved open questions

### Costs for the `viewer` role

Viewers see quantities and never money. Note the mechanism: RLS is row-level, not
column-level, so this cannot be a policy. The server simply does not select
`cost_price`, `selling_price`, stock value or order totals for a viewer, and the
route handlers that expose cost data reject that role. Phase 5 ships a test that a
viewer request returns no monetary fields.

### One open order per supplier

Accepted. A delivery split across weeks is the same open order received twice, which
the ledger and outstanding quantities already handle. Only two simultaneous orders to
the same supplier are blocked, and the remedy is visible: the existing order is
offered instead of creating a second one.

### CSV import

Split the item in two. **Export is in the MVP** (Phase 5 item 9): read-only, no new
validation surface. **Import is deferred to post-MVP**, because it adds duplicate-SKU
handling, unit parsing, partial failure reporting and a dry-run step — more surface
than a validation prototype needs. If import is wanted later it gets its own rules
and its own tests.

## Consequences

- `docs/plans/phase-3-architecture.md` is now the implementation contract. Changing
  the schema, the ledger rules or the receiving transaction requires a new decision
  record or a dated addendum to it, not a silent edit.
- Phase 4 is next: install `drizzle-kit` with a real config, replace the migration
  and seed stubs, make the CI migration step fail when it applies nothing, then
  prepare the Supabase and Vercel projects. Every hosted action waits for Gate D.
- Phase 5 follows the roadmap order, starting with the shell, then schema, RLS and
  seed, then auth.
- `0005-stack-hybrid-supabase.md` remains in force and needed no change.
- No product code has been written, and none is authorised by this record alone:
  Gate D approves the infrastructure actions.
