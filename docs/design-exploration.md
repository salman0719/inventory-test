# Interactive Design Exploration

## Objective

Create three materially different interactive design directions before settling on the product's visual language. Static screenshots alone are insufficient.

## Required screens per direction

- Dashboard
- Product list
- Product detail or create/edit form
- Inventory list
- Stock adjustment interaction
- Supplier list/detail
- Purchase order list
- Purchase order create/edit
- Partial receiving flow

## Directions to explore

The agent should develop its own concepts, but consider these as useful starting points:

### Direction A: Calm and operational

- Clear hierarchy.
- Restrained colour.
- Strong data tables.
- Quick actions close to relevant data.
- Low visual noise.

### Direction B: Modern and visual

- More use of cards and visual stock indicators.
- Stronger colour identity.
- More prominent dashboard summaries.
- Friendly, approachable language.

### Direction C: Compact and productivity-focused

- Dense but readable tables.
- Keyboard-friendly workflows.
- Persistent filters and contextual side panels.
- Optimised for frequent daily use.

Do not make all three directions minor colour variations of the same layout.

## Compare

For each direction document:

- What is faster to understand?
- What is faster for frequent operators?
- How well does it handle large product lists?
- How does it behave on mobile?
- Does it feel trustworthy for business data?
- What could become visually cluttered?
- Which elements should be retained or discarded?

## Interaction expectations

Prototype representative interactions:

- Navigate between sections.
- Search/filter a product list.
- Open a product detail.
- Start a stock adjustment.
- Create a purchase order.
- Receive part of an order.
- Switch between Demo Cafe and Demo Retail.

Use realistic sample data. Make controls behave plausibly even if the design prototype is not yet connected to the database.

## Design system after selection

Document:

- Colour tokens and semantic status colours.
- Typography scale.
- Spacing scale.
- Border radius and elevation.
- Buttons and form controls.
- Table patterns.
- Cards and summary metrics.
- Dialogs, drawers, and notifications.
- Responsive breakpoints and mobile patterns.
- Accessibility and contrast considerations.

Approval: user chooses or combines a direction before full application implementation.

## Selected direction (Gate B, approved 2026-11-21; revised to C)

Direction C, compact and productive. First recorded with Direction A as the base
and revised the same day at the project owner's request after reviewing the
prototypes. Full rationale, accepted risks and mitigations are in
`docs/decisions/0006-gate-b-design.md`.

The prototype was built in the untracked sandbox (`local/phase-2-design/`) and is
not versioned, so the direction is specified here.

### Structure

- 54 px icon rail: brand block, then seven sections with a glyph and short label —
  Dash, Prod, Inv, Supp, POs, Rep, Set — with reset at the foot. The active
  section is marked with a lighter rail background and white text.
- 46 px top bar: product search (max 380 px) with a `/` key hint, a Cafe / Retail
  segmented control, and a shortcut legend that hides below 900 px.
- Split view: flexible list pane plus a 372 px contextual panel. The list takes
  the full width when nothing is selected.
- Dashboard: five-stat strip (products, stock value, low/out, open POs, suppliers),
  then a needs-attention table (out of stock first, then low, with on-order), then
  recent movements.
- Products: table of product, SKU, on hand, reorder, on order, cost, value, status.
  Selecting a row fills the panel instead of navigating away.
- Inventory: the same table plus a per-row `adj` button and low/out counts in the
  pane header.
- Product detail panel: 2×2 key values (on hand, on order, reorder, cost), an
  inline "Record movement" form (type, reason, quantity, save), and a compact
  movements table. On-hand is never typed directly.
- Purchase order panel: per-line ordered / received / outstanding with an inline
  receive input pre-filled to outstanding and bounded by it, one Receive action,
  line totals, and a warning that drafts reserve no stock.
- New product and new purchase order are panel forms, not separate pages.
- Feedback is a toast; empty search and empty needs-attention each have a written
  state rather than a blank region.

### Design system

Ten role tokens, no raw palette utilities.

| Role token  | Value                  | Use                                   |
| ----------- | ---------------------- | ------------------------------------- |
| `ink`       | #0f172a                | Body text, headings, rail background  |
| `surface`   | #ffffff                | Panels, table and form backgrounds    |
| `line`      | #e2e8f0                | Borders, dividers, table rules        |
| `accent`    | #4338ca                | Selection, primary action, ordered    |
| `warning`   | #b45309                | Low stock, partially received         |
| `danger`    | #b91c1c                | Out of stock, negative movement       |
| `success`   | #15803d                | Received, healthy stock               |
| `info`      | maps to `accent`       | C uses no separate informational tone |
| `on-accent` | #ffffff                | Text on accent fills                  |
| `scrim`     | rgba(15, 23, 42, 0.45) | Backdrop behind the mobile panel      |

Derived values, not roles: muted text #64748b, faint text #94a3b8, rail text
#cbd5e1, panel tint #f8fafc, accent-soft #eef2ff, and soft warning/success/danger
backgrounds. Implement these as tints derived from `ink`, `line`, `accent` and the
status roles, or as a small documented derived set — never as raw palette classes —
with a contrast check at implementation.

**Typography.** Base 13 px / 1.45; table 13 px; uppercase column headers 10.5 px at
0.07 em; panel title 13 px at 650 weight; meta and field labels 10.5–11 px; stat
values 15 px; numeric columns in a monospaced stack with tabular figures. Nothing
smaller than 13 px carries prose.

**Spacing.** 2 / 4 / 6 / 8 / 10 / 12 / 16 px — tighter than A by design; the density
is the point.

**Radius and elevation.** 3 px tags, 4 px controls, 5 px panels. No shadows; sticky
headers and the mobile panel overlay are the only raised surfaces.

**Tables.** 6 px vertical and 10 px horizontal cell padding, sticky header, row
hover and a selected row with a 2 px accent inset on the left; quantities, costs and
values right aligned and monospaced; SKU, dates and references in faint mono.

**Status.** A dot plus a word, always: ok / low / out for stock, draft / ordered /
partially received / received for orders. Colour reinforces the label, never
replaces it.

**Components.** Icon rail; command search with key hint; segmented business switch;
stat strip; dense table with sticky header and selection; contextual detail panel;
inline form; per-line receive input; status dot and label; toast; warning box;
keyboard legend; empty state.

**Interaction.** `/` focuses search, `Esc` closes the panel, `a` focuses the
adjustment quantity, `r` receives the open order, `1`–`7` switch sections. Each of
these mirrors a visible control so the app is fully usable without a keyboard.

**Responsive.** Below 900 px the panel becomes a full-width overlay above the list,
with a visible close button and focus returned to the originating row; the shortcut
legend hides; tables scroll horizontally; touch targets are at least 44 px. Below
600 px the rail becomes a horizontal, labelled section bar.

**Accessibility.** Real buttons for every action; labels on every input, including
per-line receive fields, which are also bounded by the outstanding quantity; the
selected row is announced, not just tinted; the panel is reachable by keyboard and
its close is visible, not Esc-only.

### Rejected

- Direction A as the base: safe and scannable, but it reads as a generic admin
  template and spends width on chrome rather than information; kept as the fallback
  if C fails testing.
- Direction B as the base: the card grid does not survive 160 products, and drawer
  and modal focus handling is the highest-risk accessibility work of the three.
