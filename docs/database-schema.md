# Initial Database Schema Guidance

This is a starting point for architecture discussion, not a final schema. Confirm relationships, constraints, indexes, and RLS policies during Phase 3.

## Core entities

### businesses

- id
- name
- business_type (`cafe`, `retail`, or `other`)
- currency_code (default AUD)
- created_at
- updated_at

### business_members

- id
- business_id
- user_id
- role (keep simple initially)
- created_at

### categories

- id
- business_id
- name
- created_at

### products

- id
- business_id
- category_id
- name
- sku
- description
- unit_of_measure
- cost_price
- selling_price (nullable)
- reorder_level
- image_path (nullable)
- is_archived
- created_at
- updated_at

### suppliers

- id
- business_id
- name
- contact_name
- email
- phone
- address
- notes
- is_archived
- created_at
- updated_at

### product_suppliers

Use only if products can have multiple suppliers. Otherwise a nullable `supplier_id` on products may be simpler. Do not over-model without a demonstrated need.

### inventory_locations

Optional for the first prototype. Add only if the demo needs more than one stock location.

### stock_movements

- id
- business_id
- product_id
- location_id (nullable)
- movement_type (`opening`, `received`, `stock_in`, `stock_out`, `adjustment`)
- quantity_delta (signed numeric)
- reason (nullable)
- reference_type (nullable)
- reference_id (nullable)
- unit_cost (nullable)
- created_by (nullable)
- created_at

The movement ledger is the source of truth. Decide and document how opening balances and corrections are represented.

### purchase_orders

- id
- business_id
- supplier_id
- order_number
- status
- ordered_at (nullable)
- expected_delivery_at (nullable)
- notes
- created_at
- updated_at

### purchase_order_lines

- id
- business_id
- purchase_order_id
- product_id
- quantity_ordered
- unit_cost
- created_at
- updated_at

### purchase_receipts

- id
- business_id
- purchase_order_id
- received_at
- notes
- received_by (nullable)

### purchase_receipt_lines

- id
- business_id
- receipt_id
- purchase_order_line_id
- quantity_received
- unit_cost (nullable)

A receipt should generate the corresponding stock movement(s) within the same transaction.

## Integrity requirements

- Use numeric/decimal types for money, not floating-point.
- Quantities should support fractional units where relevant.
- Prevent negative ordered or received quantities.
- Prevent duplicate SKU within a business if that is the chosen business rule.
- Ensure all referenced records belong to the same business.
- Use foreign keys and appropriate delete/archive behaviour.
- Index common lookups: business_id, product_id, supplier_id, status, created_at, SKU, and foreign keys as appropriate.
- Define whether archived products can still appear in historical purchase orders and stock movements.
- Define a consistent purchase order status transition model.

## Stock calculation

Current stock should be derived from the sum of stock movement deltas for a product/location, or maintained as a cache that is transactionally updated and reconcilable.

Never let an ordinary product edit silently change stock quantity.

## Purchase receiving transaction

The receiving operation should:

1. Lock or otherwise safely coordinate the purchase order and relevant lines.
2. Validate the requested received quantities.
3. Insert a receipt and receipt lines.
4. Insert stock movements for actual received quantities.
5. Update any stock cache if one exists.
6. Recalculate line outstanding quantities and order status.
7. Commit atomically.

Test concurrent receiving and duplicate submission protection if feasible.

## Tenant isolation

Every query and mutation must be constrained by the user's business membership. Implement RLS policies and verify them with tests or controlled test accounts.
