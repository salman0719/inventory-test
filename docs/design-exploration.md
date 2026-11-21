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

## Selected direction (Gate B, approved 2026-11-21)

Direction A, calm operational, with Direction B's focused receiving modal reserved
for narrow screens. Full rationale in `docs/decisions/0006-gate-b-design.md`.

The three prototype files were built in the untracked sandbox
(`local/phase-2-design/`) and are not versioned, so the direction is specified
here.

### Structure

- Persistent left sidebar: brand, Demo Cafe / Demo Retail switch, seven sections
  (Dashboard, Products, Inventory, Suppliers, Purchase orders, Reports, Settings),
  reset at the foot.
- Dashboard: four metrics (products, stock value, needs attention, open orders),
  then two balanced panels — needs attention with stock on order, and recent
  movements.
- Products and Inventory: tables with numeric alignment; search and low/out
  filters; row opens product detail.
- Product detail: six value boxes (on hand, on order, reorder, unit cost, stock
  value, status), then movement history.
- Forms: full page, with a reason field and an explicit note that on-hand is never
  edited directly.
- Purchase orders: list of one order per supplier showing outstanding quantity;
  detail shows ordered / received / outstanding per line with a receive field and
  a single receive action.
- Mobile: sidebar becomes a horizontal section bar at 980px; tables scroll
  horizontally; forms stack in one column.

### Design system

Role tokens only, no raw palette utilities.

| Role token  | Prototype value        | Use                                    |
| ----------- | ---------------------- | -------------------------------------- |
| `ink`       | #111827                | Body text, headings                    |
| `surface`   | #ffffff                | Panels, cards, table background        |
| `line`      | #e5e7eb                | Borders, dividers, table rules         |
| `accent`    | #2563eb                | Primary action, active nav, info chip  |
| `warning`   | #b45309                | Low stock, partially received          |
| `danger`    | #b91c1c                | Out of stock, destructive action       |
| `success`   | #15803d                | Received, healthy stock                |
| `info`      | #0e7490                | Secondary informational state          |
| `on-accent` | #ffffff                | Text on accent fills                   |
| `scrim`     | rgba(17, 24, 39, 0.45) | Overlays, if a modal is used on mobile |

Open token question: the prototype also used a page canvas tint and a muted text
weight. Neither is one of the ten roles. Resolve by adding `canvas` and `muted`
roles, or by deriving them from `line` and `ink` at implementation time.

**Typography.** 1.4 rem page title, 1.05 rem section, 0.94 rem body, 0.88 rem
table, 0.83 rem meta; system font stack.

**Spacing.** 4 / 8 / 12 / 16 / 24 px.

**Radius and elevation.** 6 px controls, 8 px panels, 999 px chips; borders
instead of shadows in the base direction.

**Tables.** 11 px vertical and 16 px horizontal cell padding; uppercase 0.72 rem
column headers; quantities, costs and values right aligned with tabular numerals.

**Status.** Chips carry a word as well as a colour, so status never depends on
colour alone: draft, ordered, partially received, received, cancelled; low and
out for stock.

**Components.** App shell with sidebar and business switch; metric card; panel
with header; data table with numeric alignment; status chip; form field and
full-page form wrapper; movement history table; stock-on-order indicator; toast;
empty state panel; inline validation message.

**Accessibility.** No overlays in the base direction, so no focus traps; every
action is a real button; every receiving input is labelled and bounded by the
outstanding quantity.

### Rejected

- Direction B as the base: card grid does not survive 160 products, and drawer /
  modal focus handling is the highest-risk accessibility work.
- Direction C as the base: 12.5 px density and keyboard-first interaction fail the
  casual staff persona; the ideas worth keeping are already present in A.
