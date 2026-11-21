# Competitor and Market Research

## Research rules

Use material clearly available to the public:

- Product and pricing pages.
- Public help centres and user guides.
- Public API documentation.
- Public videos and webinars.
- Public reviews and discussions, treating individual opinions as anecdotal.

Do not scrape private or authenticated areas, bypass access controls, reverse
engineer software, or copy proprietary content/designs.

### Zoho caution

Zoho's Terms of Service include a restriction on using Zoho Services for
competitive or benchmarking purposes. Do not systematically explore or use Zoho's
demo service for competitor benchmarking unless the user has obtained written
permission from Zoho. This is not only an automated-scraping restriction.

Public Zoho marketing pages and public documentation may be reviewed for general
product-domain understanding, subject to their terms. Relevant public starting
points:

- https://www.zoho.com/au/inventory/
- https://www.zoho.com/inventory/help/
- https://www.zoho.com/inventory/api/v1/introduction/
- https://www.zoho.com/inventory/api/v1/items/
- https://www.zoho.com/inventory/api/v1/oauth/

Do not assume a public demo is free of contractual restrictions.

## Method and confidence

Phase 1 reviewed 20 public pages on **2026-11-21**: marketing pages, public help
centres and published pricing. No authenticated area, trial or demo account was
used, and Zoho was excluded from benchmarking.

Confidence is documentation-level. Marketing copy is recorded as a claim, not as
verified behaviour. Where a page did not mention a capability it is marked
"not verified" rather than assumed absent. No customer interview has occurred, so
nothing here validates demand.

## Sources

All accessed 2026-11-21. "Supports" is what the page actually documents.

| #   | Source                                   | URL                                                                                                    | Supports                                                                        |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 1   | Lightspeed Retail — Purchase Orders (AU) | https://www.lightspeedhq.com/au/pos/retail/purchase-orders                                             | Order is separate from receipt; stock on order visible; PO as record            |
| 2   | Lightspeed Retail — Inventory (AU)       | https://www.lightspeedhq.com/au/pos/retail/inventory-management-software/                              | Reorder points, low-stock alerts, counting tools, supplier catalogues           |
| 3   | Square for Retail (AU)                   | https://squareup.com/au/en/point-of-sale/retail                                                        | Sale/restock/adjustment view, bulk receive, POs with vendors, Free/$109         |
| 4   | Square for Retail — features             | https://squareup.com/au/en/point-of-sale/retail/features                                               | Forecast-driven reorder suggestions; cycle counts on paid tier                  |
| 5   | BSimple (AU retail)                      | https://bsimple.com.au/inventory-management-software-retail-store/                                     | Receipt updates quantity and cost; cycle counts; price variance; $180 AUD       |
| 6   | Cin7 Core — Process a purchase           | https://help.core.cin7.com/hc/en-us/articles/9034492644879-Process-a-Purchase                          | Partial delivery requires converting to an Advanced Purchase                    |
| 7   | Cin7 Core — Advanced Purchase            | https://help.core.cin7.com/hc/en-us/articles/9034446632975-Advanced-Purchase-Partial-Orders-Deliveries | Multiple receipts and deliveries; unreceived items as separate lines            |
| 8   | Cin7 Core — Purchase status values       | https://help.core.cin7.com/hc/en-us/articles/9034557801871-Purchases-Views-and-Order-Status-Values     | "Partially Received" as a named stock status                                    |
| 9   | Unleashed — Split receipt a PO           | https://intercom.help/unleashed-support/en/articles/11581906-split-receipt-a-purchase-order            | Remainder moves to a new PO with a /1 suffix; paid tier only                    |
| 10  | Unleashed — Receipt and complete a PO    | https://intercom.help/unleashed-support/en/articles/11581891-receipt-and-complete-a-purchase-order     | Receipt increases SOH and average landed cost; receipt ≠ complete               |
| 11  | Cin7 Omni — Backorder for purchases      | https://help.omni.cin7.com/hc/en-us/articles/9128545394831-Backorder-for-purchases                     | Remainder split into a related PO with a letter suffix                          |
| 12  | Ordermentum — pricing                    | http://ordermentum.com/pricing                                                                         | Free venue tier; Pro $49/mo; staff carts with manager approval; accounting sync |
| 13  | Upstock — for cafes                      | https://www.upstock.app/for/cafes                                                                      | One cart across suppliers, dispatch per supplier, minimum orders, favourites    |
| 14  | Previo (AU)                              | https://previo.com.au/                                                                                 | Square sales sync, forecast reorder, expiry/FIFO, orders from own Gmail         |
| 15  | FoodByUs (AU)                            | https://www.foodbyus.com.au/                                                                           | Hospitality procurement, price comparison, invoice hub, menu costing            |
| 16  | MarketMan — pricing                      | https://www.marketman.com/pricing-for-restaurant-inventory-management-system                           | Starter $249/mo, Growth $299/mo; currency not stated                            |
| 17  | Square Restaurant Inventory (MarketMan)  | https://squareup.com/au/en/inventory-management/restaurants                                            | Par levels, waste, recipe costing, invoice photo capture, multi-location        |
| 18  | Tab2Kit (AU cafes)                       | https://tab2kit.com/solutions/cafe-management-software                                                 | Wastage records, expiry/batch, supplier price comparison, POs                   |
| 19  | PantryHub (AU)                           | https://pantryhub.com.au/                                                                              | Gut-feel ordering pain, par levels, phone ordering, variance reports            |
| 20  | Lightspeed Restaurant — inventory (AU)   | https://www.lightspeedhq.com/au/pos/restaurant/inventory                                               | Mobile stocktakes, par levels with recommended orders, recipe costing           |

## Baseline expectations

Table stakes across every product reviewed:

1. Product records with cost price and supplier association.
2. Purchase orders created per supplier and sent or kept as a record.
3. Receipt as the event that changes stock — never the order.
4. Partial delivery handling, usually by splitting the order.
5. Movement history and manual adjustments with a reason.
6. Counting that produces a correction, ideally on a phone.
7. A reorder signal (reorder point, par level, or forecast).
8. Working on a phone or tablet for ordering, receiving and counting.

## Capability matrix

`●` documented · `◐` partial/adjacent · `○` not mentioned in the reviewed page ·
`NV` not verified.

| Capability                | Square Retail | Lightspeed Retail | Cin7 / Unleashed | AU cafe tools | Prototype  |
| ------------------------- | ------------- | ----------------- | ---------------- | ------------- | ---------- |
| Products, SKU, cost       | ●             | ●                 | ●                | ●             | ●          |
| Suppliers                 | ●             | ●                 | ●                | ●             | ●          |
| Purchase orders           | ●             | ●                 | ●                | ●             | ●          |
| Partial receiving         | ◐             | ◐                 | ●                | ◐             | ● planned  |
| Stock on order visible    | ○             | ●                 | ●                | ◐             | ◐ proposed |
| Movement history          | ●             | ◐                 | ●                | ◐             | ●          |
| Adjustment with reason    | ●             | ◐                 | ●                | ●             | ●          |
| Stocktake / cycle count   | ●             | ●                 | ○                | ●             | ◐          |
| Reorder point / par level | ●             | ●                 | ◐                | ●             | ●          |
| Price variance on receipt | ○             | ○                 | ●                | ◐             | ○          |
| Recipes / depletion       | ●             | ●                 | ○                | ●             | ○ excluded |
| POS sync                  | ●             | ●                 | NV               | ●             | ○ excluded |
| Accounting sync           | NV            | NV                | ●                | ●             | ○ excluded |
| Multi-location            | ●             | ●                 | ●                | ●             | ○ excluded |
| Expiry / batch            | ○             | ○                 | ○                | ●             | ○          |

## Findings

1. **The receipt, not the order, changes stock.** Documented by four vendors
   (2, 5, 9, 10, 11). Orders must never move stock.
2. **Partial delivery is the industry's hard case, solved by splitting orders.**
   Unleashed moves outstanding quantities to a new PO with a `/1` suffix (9); Cin7
   Omni splits a backorder with a letter suffix (11); Cin7 Core requires an
   Advanced Purchase with multiple receipts (6, 7). Split receipting is gated to
   paid tiers (9). Status names include "Partially Received" (8).
3. **Stock on order is a first-class view, not a report** (1). Without it an
   operator cannot tell whether a low item is already coming.
4. **Cost arrives late**, so receipt and completion are separate (10); price
   variance awareness is sold as a strength (5, 18).
5. **The verticals diverge after the shelf.** Cafes compete on recipes, par
   levels, waste, expiry and POS sync (14, 16–20); retail on barcode counting,
   variants, multi-location and forecasts (2–5).
6. **Hospitality orders across suppliers in one sitting** (12, 13), while POs
   remain per supplier (1, 3).

## Pricing observed

| Product                | Displayed price                       | Note                                     |
| ---------------------- | ------------------------------------- | ---------------------------------------- |
| Square for Retail (AU) | Free $0/mo; Plus $109/mo per location | Plus processing fees; AUD                |
| BSimple (AU)           | From $180/month AUD                   | Inventory, purchasing, invoicing         |
| Ordermentum (AU)       | Free $0; Pro $49/month                | Approvals, any supplier, accounting sync |
| MarketMan              | Starter $249/mo; Growth $299/mo       | Currency not stated — not verified AUD   |
| Previo (AU)            | Free plan; paid tiers                 | Paid pricing not captured                |
| PantryHub (AU)         | 14-day free trial                     | No price on the reviewed page            |

A single-day snapshot, not a market survey. Small operators are used to
free-to-start tools, with a paid step around $49–$180 AU for stock control.

## Research synthesis

- **Common baseline expectations:** the eight items above. Anything missing reads
  as an incomplete product.
- **Opportunities for simplicity:** one PO carrying its own outstanding
  quantities instead of suffixed clone orders; stock on order shown beside
  on-hand; a receipt that reads as an explanation rather than a number change.
- **Cafe-specific considerations:** without recipes or POS sync the product covers
  purchasing, receiving, wastage and count correction only. The demo must say so
  rather than imply depletion tracking.
- **Retail-specific considerations:** density, SKU search, unit cost accuracy and
  stock value matter more than par levels.
- **Pricing observations:** free entry on ordering, low monthly for stock control,
  high monthly for full restaurant suites.
- **Unresolved assumptions:** whether operators will accept a single-PO model;
  whether cafe buyers will see value without recipe costing; all pricing.
- **Product implications:** the approved Gate A scope holds. See
  `docs/decisions/0004-gate-a-scope.md`.

## Questions still to answer

1. What are the minimum inventory workflows customers expect? — answered at
   documentation level; needs operator confirmation.
2. How do products, variants, units and SKUs commonly work? — answered; variants
   deferred.
3. How do purchase orders and receiving work, especially partial deliveries? —
   answered in detail.
4. What terminology is familiar to cafe and retail operators? — partially
   answered; "stock" versus "inventory" is unresolved.
5. What is typically too complex for a small operator? — answered qualitatively.
6. Which features are table stakes versus differentiators? — answered.
7. What are common onboarding and migration pain points? — not researched.
8. What pricing models are visible in the Australian market? — snapshot only,
   not a survey.
