-- Slice F: multiple suppliers per product.
--
-- `products.supplier_id` and `products.supplier_sku` move to one link row per
-- product and supplier. The default link is the supplier the product form shows
-- and the one stock and attention lists name; every active link is a supplier the
-- product can be ordered from. Keeping the old columns would give the catalogue
-- two answers to "who supplies this?", so they are backfilled and then dropped.
--
-- The supplier's lead time stays on `suppliers` as the fallback; a link's own
-- lead time wins when it is set, because one product can have a different lead
-- time at a second wholesaler.

CREATE TABLE "product_suppliers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "supplier_id" uuid NOT NULL,
  "supplier_sku" text,
  "lead_time_days" integer,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "product_suppliers_lead_time_days_check"
    CHECK ("lead_time_days" is null or "lead_time_days" between 0 and 365)
);--> statement-breakpoint

ALTER TABLE "product_suppliers"
  ADD CONSTRAINT "product_suppliers_business_id_businesses_id_fk"
  FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_suppliers"
  ADD CONSTRAINT "product_suppliers_product_fk"
  FOREIGN KEY ("business_id","product_id")
  REFERENCES "public"."products"("business_id","id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_suppliers"
  ADD CONSTRAINT "product_suppliers_supplier_fk"
  FOREIGN KEY ("business_id","supplier_id")
  REFERENCES "public"."suppliers"("business_id","id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "product_suppliers_business_product_supplier_key"
  ON "product_suppliers" USING btree ("business_id","product_id","supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_suppliers_one_default"
  ON "product_suppliers" USING btree ("business_id","product_id")
  WHERE "product_suppliers"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "product_suppliers_code_key"
  ON "product_suppliers" USING btree
    ("business_id","supplier_id",lower("supplier_sku"))
  WHERE "product_suppliers"."supplier_sku" is not null;--> statement-breakpoint
CREATE INDEX "product_suppliers_business_supplier_idx"
  ON "product_suppliers" USING btree
    ("business_id","supplier_id");--> statement-breakpoint

-- Every product that named a supplier becomes that supplier's default link.
-- Products that had no supplier keep none: the product form refuses to save one
-- that way, but a legacy row is not invented into a relationship it never had.
INSERT INTO "product_suppliers"
  ("business_id", "product_id", "supplier_id", "supplier_sku", "is_default")
SELECT p."business_id", p."id", p."supplier_id", p."supplier_sku", true
  FROM "products" p
 WHERE p."supplier_id" IS NOT NULL;--> statement-breakpoint

ALTER TABLE "products" DROP CONSTRAINT "products_supplier_code_check";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_supplier_fk";--> statement-breakpoint
DROP INDEX "products_business_supplier_idx";--> statement-breakpoint
DROP INDEX "products_business_supplier_code_key";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "supplier_id";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "supplier_sku";--> statement-breakpoint

COMMENT ON TABLE "product_suppliers" IS
  'Which suppliers can supply a product; exactly one row is the default.';--> statement-breakpoint
COMMENT ON COLUMN "product_suppliers"."lead_time_days" IS
  'Overrides suppliers.lead_time_days for this product when set.';--> statement-breakpoint

ALTER TABLE "product_suppliers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "product_suppliers_select" ON "product_suppliers"
  FOR SELECT TO "authenticated"
  USING (private.is_member(business_id));--> statement-breakpoint
CREATE POLICY "product_suppliers_insert" ON "product_suppliers"
  FOR INSERT TO "authenticated"
  WITH CHECK (private.has_role(business_id, ARRAY['owner', 'staff']));--> statement-breakpoint
CREATE POLICY "product_suppliers_update" ON "product_suppliers"
  FOR UPDATE TO "authenticated"
  USING (private.has_role(business_id, ARRAY['owner', 'staff']))
  WITH CHECK (private.has_role(business_id, ARRAY['owner', 'staff']));--> statement-breakpoint
CREATE POLICY "product_suppliers_delete" ON "product_suppliers"
  FOR DELETE TO "authenticated"
  USING (private.has_role(business_id, ARRAY['owner', 'staff']));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "product_suppliers" TO "authenticated";--> statement-breakpoint

-- The demo reset restores the baseline catalogue, so it now creates the default
-- link for each product instead of writing the dropped product columns. This
-- re-creates the function from `0017` with that change and the link cleanup.
CREATE OR REPLACE FUNCTION "private"."reset_demo_business"(
  p_business_id uuid,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_categories int := 0;
  v_suppliers int := 0;
  v_products int := 0;
  v_links int := 0;
  v_movements int := 0;
  v_orders int := 0;
  v_lines int := 0;
  v_inserted int := 0;
  v_expected int := 0;
  v_order jsonb;
  v_order_id uuid;
  v_supplier uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to reset demo data.' USING ERRCODE = '42501';
  END IF;

  IF NOT private.is_member(p_business_id)
     OR NOT private.has_role(p_business_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Only an owner can reset this business''s data.'
      USING ERRCODE = '42501';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'The reset data is missing.' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(coalesce(p_payload->'categories', '[]'::jsonb)) > 50
     OR jsonb_array_length(coalesce(p_payload->'suppliers', '[]'::jsonb)) > 50
     OR jsonb_array_length(coalesce(p_payload->'products', '[]'::jsonb)) > 500
     OR jsonb_array_length(coalesce(p_payload->'orders', '[]'::jsonb)) > 20 THEN
    RAISE EXCEPTION 'The demo data is larger than a demo reset should be.'
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM purchase_receipt_lines WHERE business_id = p_business_id;
  DELETE FROM purchase_receipts      WHERE business_id = p_business_id;
  DELETE FROM purchase_order_lines   WHERE business_id = p_business_id;
  DELETE FROM purchase_orders        WHERE business_id = p_business_id;
  DELETE FROM stock_movements        WHERE business_id = p_business_id;
  DELETE FROM stocktake_lines        WHERE business_id = p_business_id;
  DELETE FROM stocktake_sessions     WHERE business_id = p_business_id;
  DELETE FROM product_suppliers      WHERE business_id = p_business_id;
  DELETE FROM products               WHERE business_id = p_business_id;
  DELETE FROM suppliers              WHERE business_id = p_business_id;
  DELETE FROM activity_log           WHERE business_id = p_business_id;
  DELETE FROM categories             WHERE business_id = p_business_id;

  INSERT INTO categories (business_id, name)
  SELECT p_business_id, t.name
    FROM jsonb_array_elements_text(p_payload->'categories') AS t(name);
  GET DIAGNOSTICS v_categories = ROW_COUNT;

  INSERT INTO suppliers
    (business_id, name, contact_name, email, phone, address, notes)
  SELECT p_business_id, x.name, x.contact_name, x.email, x.phone,
         x.address, x.notes
    FROM jsonb_to_recordset(p_payload->'suppliers') AS x(
      name text, contact_name text, email text, phone text, address text,
      notes text
    );
  GET DIAGNOSTICS v_suppliers = ROW_COUNT;

  INSERT INTO products
    (business_id, category_id, name, sku, unit_of_measure,
     cost_price, selling_price, reorder_level)
  SELECT p_business_id, c.id, x.name, x.sku, x.unit,
         x.cost::numeric, x.selling::numeric, x.reorder::numeric
    FROM jsonb_to_recordset(p_payload->'products') AS x(
      name text, sku text, category text, supplier text, unit text, cost text,
      selling text, reorder text, opening text
    )
    JOIN categories c
      ON c.business_id = p_business_id AND c.name = x.category;
  GET DIAGNOSTICS v_products = ROW_COUNT;

  IF v_products <> jsonb_array_length(p_payload->'products') THEN
    RAISE EXCEPTION 'A demo product is missing its category.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO product_suppliers
    (business_id, product_id, supplier_id, is_default)
  SELECT p_business_id, p.id, s.id, true
    FROM jsonb_to_recordset(p_payload->'products') AS x(
      sku text, supplier text
    )
    JOIN products p
      ON p.business_id = p_business_id AND p.sku = x.sku
    JOIN suppliers s
      ON s.business_id = p_business_id AND s.name = x.supplier;
  GET DIAGNOSTICS v_links = ROW_COUNT;

  IF v_links <> v_products THEN
    RAISE EXCEPTION 'A demo product is missing its supplier.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO stock_movements
    (business_id, product_id, movement_type, quantity_delta, reason, created_by)
  SELECT p_business_id, p.id, 'opening', x.opening::numeric,
         'Opening balance', auth.uid()
    FROM jsonb_to_recordset(p_payload->'products') AS x(sku text, opening text)
    JOIN products p ON p.business_id = p_business_id AND p.sku = x.sku
   WHERE x.opening::numeric > 0;
  GET DIAGNOSTICS v_movements = ROW_COUNT;

  FOR v_order IN
    SELECT * FROM jsonb_array_elements(
      coalesce(p_payload->'orders', '[]'::jsonb)
    )
  LOOP
    IF v_order->>'status' NOT IN ('draft', 'ordered') THEN
      RAISE EXCEPTION 'A demo order has an unsupported status.'
        USING ERRCODE = '22023';
    END IF;

    SELECT s.id INTO v_supplier
      FROM suppliers s
     WHERE s.business_id = p_business_id
       AND s.name = v_order->>'supplier';

    IF v_supplier IS NULL THEN
      RAISE EXCEPTION 'A demo order names a supplier outside the payload.'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO purchase_orders
      (business_id, supplier_id, order_number, status, ordered_at,
       expected_delivery_at, notes)
    VALUES (
      p_business_id,
      v_supplier,
      v_order->>'orderNumber',
      v_order->>'status',
      CASE
        WHEN v_order->>'orderedDaysAgo' IS NULL THEN NULL
        ELSE now() - ((v_order->>'orderedDaysAgo')::int || ' days')::interval
      END,
      CASE
        WHEN v_order->>'expectedInDays' IS NULL THEN NULL
        ELSE current_date + (v_order->>'expectedInDays')::int
      END,
      v_order->>'notes'
    )
    RETURNING id INTO v_order_id;

    v_expected := jsonb_array_length(coalesce(v_order->'lines', '[]'::jsonb));

    INSERT INTO purchase_order_lines
      (business_id, purchase_order_id, product_id, quantity_ordered, unit_cost)
    SELECT p_business_id, v_order_id, p.id, l.quantity, p.cost_price
      FROM jsonb_to_recordset(coalesce(v_order->'lines', '[]'::jsonb)) AS l(
        sku text, quantity numeric
      )
      JOIN products p ON p.business_id = p_business_id AND p.sku = l.sku;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    IF v_inserted <> v_expected OR v_expected = 0 THEN
      RAISE EXCEPTION 'A demo order line names a product outside the payload.'
        USING ERRCODE = '22023';
    END IF;

    v_orders := v_orders + 1;
    v_lines := v_lines + v_inserted;
  END LOOP;

  RETURN jsonb_build_object(
    'categories', v_categories,
    'suppliers', v_suppliers,
    'products', v_products,
    'movements', v_movements,
    'orders', v_orders,
    'lines', v_lines
  );
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION "private"."reset_demo_business"(uuid, jsonb) FROM PUBLIC;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION "private"."reset_demo_business"(uuid, jsonb) TO "authenticated";
