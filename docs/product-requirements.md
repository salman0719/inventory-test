# Product Requirements

## 1. Vision

A straightforward inventory and purchasing tool for small-to-medium Australian businesses that currently rely on spreadsheets, paper, or disconnected systems.

The prototype should validate demand and workflows, not deliver a complete ERP.

## 2. Initial user types

- Cafe owner or manager
- Retail shop owner or manager
- Staff member who records stock movements or receives deliveries

For the prototype, advanced roles and granular permissions are out of scope. Keep the data model capable of evolving, but do not build a complex role system.

## 3. Core navigation

1. Dashboard
2. Products
3. Inventory
4. Suppliers
5. Purchase Orders
6. Reports
7. Settings
8. Demo business selector

The business selector should be visible and easy to understand. Switching it must change the active dataset throughout the application.

## 4. Functional requirements

### Dashboard

- Product count.
- Total inventory value, with the valuation method documented.
- Low-stock and out-of-stock counts.
- Open and overdue purchase orders.
- Recent stock movements.
- Useful links to common actions.
- All figures must come from the selected business's real data.

### Products

- Create, view, edit, archive products.
- Name, SKU, description, category, unit of measure.
- Cost price and optional selling price.
- Supplier association.
- Reorder threshold.
- Optional product image.
- Search, filter, sort, and pagination.
- Support simple variants only if they are needed for the Retail demo and do not materially complicate the model.

### Inventory

- Current stock by product.
- Stock-in.
- Stock-out.
- Adjustment with reason.
- Optional basic locations, if justified by demo workflows.
- Movement history with date, product, quantity, movement type, reference, and reason.
- Low-stock and out-of-stock states.
- Manual barcode/SKU entry only. No barcode hardware integration.

### Suppliers

- Create, view, edit, archive suppliers.
- Business name, contact name, email, phone, address, notes.
- Products supplied.
- Purchase order history.
- Do not use real people's contact details in seed data.

### Purchase orders

- Create purchase order for a supplier.
- Add products, quantities, and unit costs.
- Expected delivery date and notes.
- Draft, sent/ordered, partially received, received, cancelled states.
- Receive all or part of an order.
- Record received quantity per line.
- Show outstanding quantities.
- Update inventory only for quantities actually received.
- Preserve receiving and status history.
- Do not implement email delivery or supplier portals in the first prototype unless explicitly approved.

### Reports

- Current stock report.
- Low-stock report.
- Stock movement history.
- Purchase order status report.
- Basic inventory valuation.
- CSV export where practical.

### Settings

- Business profile for demo display.
- Basic units/categories configuration if useful.
- Demo data reset.
- No billing/subscription system in this prototype.

## 5. Demonstration datasets

### Demo Cafe

Seed approximately 50 to 70 products/ingredients:

- Produce, meat, dairy, dry goods, beverages, packaging, cleaning supplies.
- Several fictional suppliers.
- Mixed stock levels, including low and out-of-stock products.
- Historical movements.
- Draft, open, partially received, and completed purchase orders.

Do not build recipes, recipe-based ingredient consumption, POS integration, or automatic stock depletion.

### Demo Retail

Seed approximately 150 to 200 products:

- Several categories.
- Some simple product variants if useful.
- Several fictional suppliers.
- Mixed stock levels.
- Historical movements and purchase orders.

## 6. Key user journeys

### Journey A: Find a low-stock product

1. Open dashboard.
2. Identify low-stock alert.
3. Open product or inventory detail.
4. Review current quantity and movement history.

### Journey B: Replenish stock

1. Open purchase orders.
2. Create a purchase order for a supplier.
3. Add products and quantities.
4. Save the order.
5. Receive part of the delivery.
6. Verify received stock increased and outstanding quantity remains.
7. Receive the remaining quantity.
8. Verify the order is complete.

### Journey C: Correct a stock count

1. Find a product.
2. Record an adjustment.
3. Choose a reason, such as stock count correction, wastage, damage, or opening balance.
4. Confirm the resulting quantity.
5. Review the movement history.

### Journey D: Compare business types

1. Select Demo Cafe.
2. Explore cafe inventory and purchasing.
3. Switch to Demo Retail.
4. Confirm all screens and figures reflect the Retail dataset.
5. Confirm there is no cross-business data leakage.

## 7. Explicit exclusions

Do not implement without approval:

- Recipes and ingredient consumption.
- POS integration.
- Xero, MYOB, or accounting integrations.
- Demand forecasting or AI recommendations.
- Manufacturing, bills of materials, or production planning.
- Complex multi-warehouse logistics.
- Supplier self-service portals.
- Advanced user roles and permissions.
- Invoicing, payments, payroll, or full accounting.
- Subscription billing.
- Mobile native apps.
- Hardware barcode scanner integration.

## 8. Non-functional requirements

- Responsive web application.
- Clear and consistent UX.
- Reliable stock calculations.
- Business-level data isolation.
- Reasonable loading and error handling.
- Seed/reset workflow for repeatable demos.
- Automated tests for critical inventory and purchasing logic.
- Basic accessibility and keyboard usability.
- No unnecessary infrastructure complexity.
