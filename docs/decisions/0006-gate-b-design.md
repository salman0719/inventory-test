# 0006 Gate B design direction

- **Date:** 2026-11-21
- **Status:** Accepted
- **Context:** Phase 2 produced three interactive directions over the approved
  scope, each covering the nine required screens and the four journeys:
  A "calm operational" (sidebar, tables, full-page forms), B "modern and visual"
  (top tabs, cards, drawer and modals), C "compact and productive" (icon rail,
  dense split view, keyboard shortcuts). They were built and exercised in the
  local sandbox at `local/phase-2-design/`; that folder is intentionally
  unversioned, so the selected direction is described in
  `docs/design-exploration.md`.
- **Decision:** Adopt Direction A as the base, borrow Direction B's focused
  receiving modal for phones, and defer Direction C's density and shortcut layer.
- **Approved by:** Project owner, 2026-11-21.

## DB1 — Base direction

- **Chosen:** A, calm operational.
- A scans a 160-product list better than a card grid, gives full-page forms room
  to explain that receiving is a transaction, and avoids overlay focus and scroll
  problems entirely.
- B's card grid is the strongest first impression but the weakest at the approved
  seed size (160 products); its receiving modal is adopted for narrow screens
  where a focused task beats a page.
- C is the best tool for a daily power user and the worst for a two-minute staff
  handover; its useful ideas (density, stock-on-order in the row) are already in
  A, and shortcuts can be added later without a layout change.

## DB2 — Tokens

- **Chosen:** use the ten existing role tokens; no new semantic roles.
- Two presentation needs in the prototype are not roles and must not become raw
  palette utilities: a page canvas tint and a muted text weight. Phase 5 resolves
  them by either adding a `canvas` and `muted` role or deriving them from `line`
  and `ink`; that choice is left to implementation with a contrast check.
- Concrete values and scales are recorded in `docs/design-exploration.md`.

## DB3 — Mobile receiving

- **Chosen:** full-page receiving form first.
- Direction B's modal is the fallback if the Phase 6 phone check shows the page
  costs too many taps. Either way, receiving stays one transaction.

## Consequences

- Phase 5 builds the shell, tables, forms and components described in
  `docs/design-exploration.md`.
- Phase 6 must test receiving on a phone and confirm or replace the full-page
  form.
- The three prototypes are not versioned. Design decisions that matter live in
  the tracked documents, not in the sandbox.
- Nothing here authorises implementation: Phase 3 architecture and Gate C come
  first.
