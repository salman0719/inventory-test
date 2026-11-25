-- Slice C: activity log.
--
-- The ledger records stock. Everything else an operator changes — a product, a
-- supplier, an order — left no trace of who changed it. This table is that trace:
-- append-only, one explicit event per action, written inside the same transaction
-- as the change it describes.
--
-- No triggers, on purpose: a trigger cannot record why, cannot tell a deliberate
-- edit from a seed, and would fire once per row in a bulk import. The transaction
-- knows the intent, so the application writes the event there.
--
-- `detail` holds ids, not copies of names, so renaming a product does not rewrite
-- history; `summary` is the sentence a person reads later.

CREATE TABLE "activity_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" uuid NOT NULL,
  "actor_user_id" uuid NOT NULL,
  "action" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid,
  "summary" text NOT NULL,
  "detail" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "activity_log_action_check" CHECK ("action" in (
    'product.created','product.updated','product.archived','product.restored',
    'supplier.created','supplier.updated','supplier.archived','supplier.restored',
    'purchase_order.created','purchase_order.ordered','purchase_order.cancelled',
    'purchase_order.closed_short','receipt.recorded','stocktake.completed',
    'import.completed'
  )),
  CONSTRAINT "activity_log_entity_type_check" CHECK ("entity_type" in (
    'product','supplier','purchase_order','receipt','stocktake','import'
  )),
  CONSTRAINT "activity_log_summary_check" CHECK (length(btrim("summary")) between 1 and 300)
);--> statement-breakpoint

CREATE INDEX "activity_log_business_created_idx"
  ON "activity_log" ("business_id", "created_at" DESC, "id" DESC);--> statement-breakpoint

ALTER TABLE "activity_log"
  ADD CONSTRAINT "activity_log_business_fk"
  FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id")
  ON DELETE cascade;--> statement-breakpoint

-- Deliberately no cascade: the log is evidence of who did what, so losing the
-- actor's account must not silently rewrite the history.
ALTER TABLE "activity_log"
  ADD CONSTRAINT "activity_log_actor_fk"
  FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id")
  ON DELETE no action;--> statement-breakpoint

-- Append-only: insert and select are granted, update and delete are revoked.
ALTER TABLE "activity_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "activity_log_select" ON "activity_log" FOR SELECT TO "authenticated"
  USING (private.is_member(business_id));--> statement-breakpoint
CREATE POLICY "activity_log_insert" ON "activity_log" FOR INSERT TO "authenticated"
  WITH CHECK (private.has_role(business_id, ARRAY['owner', 'staff']));--> statement-breakpoint

GRANT SELECT, INSERT ON "activity_log" TO "authenticated";--> statement-breakpoint
REVOKE UPDATE, DELETE ON "activity_log" FROM "authenticated";--> statement-breakpoint

-- The feed reads the actor's email, which lives in `auth.users` and is not readable
-- by the application role. SECURITY DEFINER keeps that inside the database while
-- the membership check stays here.
CREATE OR REPLACE FUNCTION "private"."activity_feed"(
  p_business_id uuid,
  p_filter text DEFAULT 'all',
  p_before timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50
) RETURNS TABLE (
  id uuid,
  action text,
  entity_type text,
  entity_id uuid,
  summary text,
  detail jsonb,
  created_at timestamptz,
  actor_email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 100);
BEGIN
  IF p_business_id IS NULL OR NOT private.is_member(p_business_id) THEN
    RAISE EXCEPTION 'That business is not yours.' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT a.id, a.action, a.entity_type, a.entity_id, a.summary, a.detail,
         a.created_at, u.email::text AS actor_email
    FROM activity_log a
    LEFT JOIN auth.users u ON u.id = a.actor_user_id
   WHERE a.business_id = p_business_id
     AND (
       p_filter IS NULL OR p_filter = 'all'
       OR (p_filter = 'products' AND a.action LIKE 'product.%')
       OR (p_filter = 'suppliers' AND a.action LIKE 'supplier.%')
       OR (p_filter = 'orders' AND a.action LIKE 'purchase_order.%')
       OR (p_filter = 'stock' AND a.action IN (
            'receipt.recorded', 'stocktake.completed', 'import.completed'
          ))
     )
     AND (
       p_before IS NULL OR p_before_id IS NULL
       OR (a.created_at, a.id) < (p_before, p_before_id)
     )
   ORDER BY a.created_at DESC, a.id DESC
   LIMIT v_limit;
END;
$$;--> statement-breakpoint
COMMENT ON FUNCTION "private"."activity_feed"(uuid, text, timestamptz, uuid, int)
  IS 'Members read their business''s activity with the actor''s email; the only read path into auth.users for the feed.';--> statement-breakpoint

REVOKE ALL ON FUNCTION "private"."activity_feed"(uuid, text, timestamptz, uuid, int) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "private"."activity_feed"(uuid, text, timestamptz, uuid, int) TO "authenticated";--> statement-breakpoint

-- The demo reset restores the baseline catalogue, orders and ledger, so it clears
-- the feed as well: an event that describes a product the reset deleted would be
-- history of a state that no longer exists. This re-creates the function from
-- `0006` with that one statement added.
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
    (business_id, category_id, supplier_id, name, sku, unit_of_measure,
     cost_price, selling_price, reorder_level)
  SELECT p_business_id, c.id, s.id, x.name, x.sku, x.unit,
         x.cost::numeric, x.selling::numeric, x.reorder::numeric
    FROM jsonb_to_recordset(p_payload->'products') AS x(
      name text, sku text, category text, supplier text, unit text, cost text,
      selling text, reorder text, opening text
    )
    JOIN categories c
      ON c.business_id = p_business_id AND c.name = x.category
    JOIN suppliers s
      ON s.business_id = p_business_id AND s.name = x.supplier;
  GET DIAGNOSTICS v_products = ROW_COUNT;

  IF v_products <> jsonb_array_length(p_payload->'products') THEN
    RAISE EXCEPTION 'A demo product is missing its category or supplier.'
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
