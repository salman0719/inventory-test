# 0017 Demo seeding is an operator CLI, not an in-app control

- **Date:** 2026-11-26
- **Status:** Accepted and implemented.
- **Relates to:** `docs/known-limitations.md` (demo seeding CLI),
  `docs/implementation-status.md`, `db/seed-account.ts`.

## Context

The Settings page exposed a Demo data panel to every owner of a `cafe` or
`retail` business. It showed row counts, required typing `RESET`, and called
`private.reset_demo_business`. That function deletes the business's receipts,
orders, ledger, stocktakes, products, suppliers, categories, imports and
activity, then rebuilds the bundled baseline.

The panel was convenient for the demo but wrong as an interface:

- `canResetDemoData` checked only `role === "owner"`. There is no `is_demo`
  column, so every owner of a cafe or retail business saw it, including a real
  account.
- The database function also checks only membership and owner. It has no notion
  of demo data.
- The button says “Reset demo data”, but there may be no demo data to reset. A
  real business could lose its catalogue, orders and history with no undo.

Demo seeding also needs to work for an account other than the two fixed local
demo businesses. Adding an account picker to the panel would make the dangerous
action easier to reach, not safer.

## Decisions

- **DR1 — Remove the interface.** Delete the Settings panel, its server action
  and `src/lib/demo.ts`. Settings keeps the business profile, categories and
  import/export links.
- **DR2 — Seed only an existing account.** `npm run db:seed:account -- --business
<uuid>` targets an existing business UUID. The command never creates a
  business, auth user or membership; the target must already have an owner, and
  that owner's claims are used for the call.
- **DR3 — Dry run by default.** Without `--apply`, the command prints the
  business name, id, type, owner, current row counts, dataset, action and the
  exact confirmation phrase. Nothing is written.
- **DR4 — Two independent replacement gates.** A business that already holds
  any tracked data is refused unless `--replace` is passed. In both cases
  `--apply` needs `--confirm` to exactly match `SEED <business name>` or
  `REPLACE <business name>`. The uuid and the name both have to be right.
- **DR5 — Hosted and production are explicit.** A non-loopback
  `DATABASE_URL` is refused unless `--hosted` is passed; `--hosted` uses
  `SUPABASE_DB_URL` and refuses a loopback URL. A production environment needs
  `--production` and `ALLOW_PRODUCTION_DEMO_SEED=1`.
- **DR6 — One implementation.** The command reuses `buildResetPayload` and
  `private.reset_demo_business`; it does not grow a second seeding SQL path.
  The write runs in one transaction, and a failure rolls back. The function stays
  granted to `authenticated` because the CLI and database tests call it that way;
  no app route or component references it.

## Consequences

- Customers cannot restore demo data themselves. That is intentional: the
  operation is destructive and account-wide.
- An operator can seed any existing account, including a real one, once they
  pass the explicit gates. There is no `is_demo` schema flag and no undo; the
  dry run and the pre-seed backup are the safeguards.
- The local `db:seed` and hosted `db:seed:hosted` commands still create the two
  bundled demo businesses. `db:seed:account` is for any other existing account.
- Historical documentation that describes the Settings panel is left as history;
  current requirements and limitations point at the CLI.

## Rejected alternatives

- **Keep the panel behind an `is_demo` flag.** It needs a schema change, a way
  to mark accounts and an ongoing decision about which accounts are demo; it
  also keeps a destructive owner action in the product surface.
- **Add an account selector to Settings.** It makes accidental cross-account
  seeding easier and exposes an operator tool to customers.
- **Delete `private.reset_demo_business` and write new insert-only SQL.** It
  would duplicate the catalogue, order, stocktake and import logic and split the
  definition of the baseline. The function is the tested implementation the CLI
  needs.
