# Personas and jobs to be done

**These are hypotheses, not findings.** No customer has been interviewed. They
were constructed from the brief, the public tool landscape
(`docs/competitor-research.md`) and the journeys in
`docs/product-requirements.md`, and were approved at Gate A on 2026-11-21 to give
design and scope decisions something testable. Phase 7 validation confirms or
discards them.

## Bec — cafe owner-manager (Demo Cafe)

- **Context:** one busy cafe, 8 staff, roughly 60 ingredients and supplies across
  seven suppliers: produce, milk, coffee, bakery, dry goods, packaging, cleaning.
- **Current process:** spreadsheet counts, supplier apps and phone orders, a box
  of delivery dockets, a POS trusted for sales but not for stock.
- **Jobs:** know what is low before a service; order the usual lines per supplier
  quickly; record a short delivery accurately; explain a gap between counted and
  expected stock.
- **Pains:** mid-service stockouts; deliveries in two parts; wastage never
  recorded; no record of whether the last order arrived in full.
- **Success:** walks in, sees three flagged items, knows which are already on
  order; weekly count takes 15 minutes.
- **Design implications:** low stock first, stock on order beside it, receiving on
  a phone in under a minute, wastage as a first-class reason. No recipe costing.

## Raj — independent retail owner-manager (Demo Retail)

- **Context:** one store, roughly 160 SKUs across several categories, two
  part-time staff, five suppliers.
- **Current process:** POS for sales, Excel for purchasing, a paper stocktake
  list, reorders based on what looks empty.
- **Jobs:** see what needs reordering and what is already on order; receive a
  delivery with quantity and cost correct; correct counts after a stocktake
  without losing history; know the value of stock on hand.
- **Pains:** over-ordering fast movers; receipts that do not match invoices; no
  dependable stock value; counts that overwrite rather than explain.
- **Success:** a short reorder list that accounts for incoming stock, and a stock
  value he would show his accountant.
- **Design implications:** dense scannable tables, search by name or SKU, clear
  unit cost on receipt, movement history that explains every change.

## Mia — casual staff member (both businesses)

- **Context:** opens deliveries, puts stock away, records breakages and wastage.
  Uses a phone, no training beyond a two-minute handover.
- **Current process:** writes on the delivery docket, tells the owner, or nothing
  is recorded.
- **Jobs:** record what arrived quickly without hunting for a product; record
  wastage with a reason; be confident the action saved.
- **Pains:** long forms, tiny tap targets, unclear whether it saved, no way to
  undo a mistake.
- **Success:** receive a three-line delivery in under a minute on a phone, with
  one confirmation.
- **Design implications:** mobile receiving is P0, not polish. Large controls,
  product search with recent items first, explicit success state, confirmation
  before destructive actions.

## Jobs to be done

| Job                                                    | Who           | Current substitute          | Journey |
| ------------------------------------------------------ | ------------- | --------------------------- | ------- |
| "Tell me what to reorder, and what is already coming." | Bec, Raj      | Visual shelf scan, gut feel | A, B    |
| "Record a short delivery without losing the rest."     | Bec, Mia      | Delivery docket, memory     | B       |
| "Order the usual lines in under two minutes."          | Bec           | Phone, supplier app         | B       |
| "Explain why stock does not match my count."           | Bec, Raj, Mia | Nothing; count overwritten  | C       |
| "Show me stock value and what moved this week."        | Raj, Bec      | Excel, accountant's query   | A, D    |
| "Show me this works for my kind of business."          | Bec, Raj      | Nothing comparable          | D       |

Priority implications are recorded in `docs/decisions/0004-gate-a-scope.md`; the
full prioritised feature list is summarised in `docs/product-requirements.md` §9.
