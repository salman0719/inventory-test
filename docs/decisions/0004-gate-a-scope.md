# 0004 Gate A scope, priorities and personas

- **Date:** 2026-11-21
- **Status:** Accepted
- **Context:** Phase 1 research (`docs/competitor-research.md`) and the Phase 1
  deliverable in `local/phase-1-discovery/` proposed five scope decisions at
  Gate A. Research found that competitors solve partial delivery by splitting
  purchase orders, that stock on order is a first-class view, and that the cafe
  and retail verticals diverge sharply beyond purchasing.
- **Decision:** All five proposals accepted as recommended.
- **Approved by:** Project owner, 2026-11-21.

## D1 — Scope baseline confirmed

- Recipes, POS integration and accounting sync stay excluded.
- Accepted with a cafe-depth risk: without recipes or POS depletion, the cafe demo
  covers purchasing, receiving, wastage and count correction only. The walkthrough
  must state that limit rather than imply usage tracking.

## D2 — One purchase order with outstanding lines

- A single PO carries its own outstanding quantities. No suffixed clone orders and
  no separate backorder flow.
- This is a deliberate simplification over the published industry pattern
  (Unleashed `/1` suffixes, Cin7 Omni letter suffixes, Cin7 Core Advanced
  Purchases) and is the primary differentiator to demonstrate.

## D3 — Stock on order added to P0

- Stock on order appears beside on-hand on product and low-stock views.
- Rationale: documented as first-class in Lightspeed Retail, and it prevents an
  operator re-ordering something already in transit.

## D4 — Personas accepted as hypotheses

- The three personas in `docs/personas.md` are the design target.
- Staff-on-mobile is a P0 constraint, not polish: receiving and wastage happen on
  a phone.

## D5 — Seeded dataset sizes

- Demo Cafe: approximately 60 products/ingredients.
- Demo Retail: approximately 160 products.
- Within the brief's ranges (50–70 and 150–200) while keeping reset and stocktake
  demonstrations quick.

## Consequences

- `docs/product-requirements.md` reflects the stock-on-order requirement, the seed
  sizes and a Gate A prioritisation section.
- Phase 2 design exploration covers all four journeys and every P0 feature; P1 and
  P2 are not design blockers.
- Anything outside this decision, including recipes, POS and accounting, requires a
  new decision entry.
