# Product scope

The binding scope baseline is `docs/product-requirements.md`. This file is the
short version: what is in, what is out, and where decisions are recorded.

## In scope

- Dashboard: product count, inventory value, low/out-of-stock, open and overdue
  purchase orders, recent movements, all derived from the selected business.
- Products: CRUD and archive, SKU, category, unit, cost/selling price, supplier,
  reorder threshold, optional image, search/filter/sort/pagination.
- Inventory: current stock, stock-in, stock-out, adjustments with reason,
  movement history, low and out-of-stock states.
- Suppliers: CRUD and archive, contact details, products supplied, order history.
- Purchase orders: line items, draft → ordered → partially received → received →
  cancelled, full and partial receiving, outstanding quantities.
- Reports: current stock, low stock, movement history, PO status, valuation, CSV
  export where practical.
- Settings: business profile and basic units/categories. Demo seeding is an
  operator CLI (`db:seed:account`), not an in-app control.
- Two seeded, switchable datasets: Demo Cafe and Demo Retail.

## Out of scope (explicit)

- Recipes and ingredient consumption.
- POS integration.
- Xero, MYOB, or other accounting integrations.
- Demand forecasting or AI recommendations.
- Manufacturing, bills of materials, or production planning.
- Complex multi-warehouse logistics.
- Supplier self-service portals.
- Advanced user roles and granular permissions.
- Invoicing, payments, payroll, or full accounting.
- Subscription billing, usage accounting, and retention purge (seams only).
- Mobile native apps.
- Hardware barcode scanner integration (manual SKU entry only).
- Email delivery of purchase orders or supplier portals.

New domain modules are added only through a decision in `docs/decisions/`.

## Decision log

See `docs/decisions/`. Cheapest way to stop scope creep.
