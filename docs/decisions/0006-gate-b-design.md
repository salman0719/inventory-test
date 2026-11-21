# 0006 Gate B design direction

- **Date:** 2026-11-21
- **Status:** Accepted (revised the same day)
- **Context:** Phase 2 produced three interactive directions over the approved
  scope, each covering the nine required screens and the four journeys: A "calm
  operational", B "modern and visual", C "compact and productive". All three were
  built and exercised in the local sandbox at `local/phase-2-design/`. That folder
  is intentionally unversioned, so the selected direction is specified in
  `docs/design-exploration.md`.
- **Decision:** Adopt Direction C as the base, with readability floors, a visible
  close for the narrow-screen panel, and shortcuts kept optional. Direction B's
  focused modal stays the fallback if the phone check fails.

## Revision

This decision was first recorded with Direction A as the base. On reviewing the
prototypes the project owner preferred C's look, and the record was revised the
same day, before any implementation depended on it. The reasoning for A is kept
below so the choice is not mistaken for an oversight.

## DC1 — Base direction

- **Chosen:** C, compact and productive.
- C has the only identity of the three that does not read as a generic admin
  template: a dark icon rail, an accent used sparingly for selection and primary
  action, and information density that signals "this is an operating tool".
- The split view is the substantive advantage, not decoration: receiving, stock
  on order and movement history sit beside the row being read, so the operator
  never loses the line they were working on.
- Receiving happens per line, in place, pre-filled to the outstanding quantity and
  bounded by it. That is closer to how a delivery is actually checked off than a
  separate page.
- **A was the safer recommendation** on scan quality, form clarity and build cost,
  and it remains the fallback if C proves hard to use in testing. Its weakness is
  that it looks like the category it belongs to.
- **B was rejected as the base:** the card grid does not survive 160 products, and
  drawer/modal focus handling is the highest-risk accessibility work of the three.

## DC2 — Tokens

- Use the ten existing role tokens. C's palette maps onto them: `ink` #0f172a
  (also the rail), `surface` #ffffff, `line` #e2e8f0, `accent` #4338ca,
  `warning` #b45309, `danger` #b91c1c, `success` #15803d, `on-accent` #ffffff,
  `scrim` for the narrow-screen panel backdrop, `info` mapped to `accent` because
  C uses no separate informational colour.
- C also needs derived neutrals and tints that are not roles: a muted text weight,
  a faint weight, a rail text colour, a panel tint, and soft status backgrounds.
  These must not become raw palette utilities. Resolve them as tints derived from
  `ink`/`line`/`accent`, or as a small set of documented derived tokens, with a
  contrast check. That choice is left to implementation.

## DC3 — Mobile receiving

- **Chosen:** the contextual panel becomes a full-width overlay above the list
  below 900 px, with a visible close control, and receiving stays the same inline
  per-line form.
- Direction B's focused modal remains the fallback if Phase 6 testing shows the
  overlay is slow or the density is unusable on a phone.

## Accepted risks and mitigations

| Risk                                         | Mitigation                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 12.5 px tables are hard to read              | 13 px minimum for body and table text; 10.5 px only for uppercase labels; 13 px was applied to the prototype |
| Icon rail labels at 8.5 px are illegible     | Rail labels at 10 px, and a horizontal labelled bar below 600 px                                             |
| Narrow-screen panel trapped users (Esc only) | Visible close button in the panel header; focus returns to the originating row                               |
| Keyboard-first excludes casual staff         | Every shortcut has a visible button equivalent; shortcuts are enhancements                                   |
| Split view is cramped on tablets             | Collapse to overlay below 900 px rather than squeezing two panes                                             |
| Dense rows are hard to tap                   | 44 px minimum touch targets below 900 px                                                                     |

## Consequences

- Phase 5 builds the shell, dense tables, split view and inline panel forms
  described in `docs/design-exploration.md`.
- Phase 6 must test receiving on a phone, including the overlay close and focus
  return, and confirm or replace the pattern.
- The three prototypes are not versioned; decisions that matter live in tracked
  documents.
- Nothing here authorises implementation: Phase 3 architecture and Gate C come
  first.
