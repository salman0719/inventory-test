-- Slice A: supplier facts derived from what the books already hold.
--
-- Two nullable columns and one view; no backfill and no table redesign. Receipt
-- lines written by private.receive_purchase_order already carry the order line's
-- unit cost, so "last paid" is a query over existing receipts, not a new record.
-- products.cost_price stays the valuation price: a receipt never rewrites it.

ALTER TABLE "suppliers" ADD COLUMN "lead_time_days" integer;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_lead_time_days_check"
  CHECK ("lead_time_days" IS NULL OR "lead_time_days" BETWEEN 0 AND 365);--> statement-breakpoint
COMMENT ON COLUMN "suppliers"."lead_time_days" IS
  'Typical calendar days from ordering to delivery; null when unknown.';--> statement-breakpoint

ALTER TABLE "products" ADD COLUMN "supplier_sku" text;--> statement-breakpoint
COMMENT ON COLUMN "products"."supplier_sku" IS
  'The code this supplier uses for the product; sku stays the internal one.';--> statement-breakpoint

-- One supplier cannot use the same code for two of our products. Deliberately
-- not unique across suppliers: two wholesalers may number their catalogues the
-- same way.
CREATE UNIQUE INDEX "products_business_supplier_code_key"
  ON "products" ("business_id", "supplier_id", lower("supplier_sku"))
  WHERE "supplier_sku" IS NOT NULL AND "supplier_id" IS NOT NULL;--> statement-breakpoint

-- "Last paid" per product and supplier, from the receipts that already exist.
-- security_invoker makes the view obey the caller's RLS, like product_stock.
CREATE VIEW "product_last_price" WITH (security_invoker = true) AS
SELECT DISTINCT ON (po.business_id, pol.product_id, po.supplier_id)
       po.business_id,
       pol.product_id,
       po.supplier_id,
       rl.unit_cost,
       r.received_at
  FROM "purchase_receipt_lines" rl
  JOIN "purchase_receipts" r
    ON r.business_id = rl.business_id AND r.id = rl.receipt_id
  JOIN "purchase_orders" po
    ON po.business_id = r.business_id AND po.id = r.purchase_order_id
  JOIN "purchase_order_lines" pol
    ON pol.business_id = rl.business_id AND pol.id = rl.purchase_order_line_id
 WHERE rl.unit_cost IS NOT NULL
 ORDER BY po.business_id, pol.product_id, po.supplier_id,
          r.received_at DESC, rl.id DESC;--> statement-breakpoint
GRANT SELECT ON "product_last_price" TO "authenticated";
