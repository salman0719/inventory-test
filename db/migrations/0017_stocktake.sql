-- Slice D: stocktake.
--
-- A stocktake is a counted snapshot with a paper trail: the session records the
-- filters used to build its lines and the on-hand figure each line started from,
-- and completing it posts one `adjustment` per product whose count differs from the
-- *live* ledger sum. The snapshot is the audit baseline, never the delta's input:
-- a movement recorded between the count sheet and the finalise is stock that is
-- really there, so `counted - current` is the correction, not `counted - expected`.
--
-- Writes go through the three SECURITY DEFINER functions below, not through table
-- grants: the app role may read a session but never insert, update or delete one.

CREATE TABLE "stocktake_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" uuid NOT NULL,
  "reference" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "scope" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "started_by" uuid NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "stocktake_sessions_status_check"
    CHECK ("status" in ('draft', 'completed', 'cancelled')),
  CONSTRAINT "stocktake_sessions_reference_check"
    CHECK ("reference" ~ '^ST-[0-9]{4,}$'),
  CONSTRAINT "stocktake_sessions_completed_check"
    CHECK (("status" = 'completed') = ("completed_at" IS NOT NULL)),
  CONSTRAINT "stocktake_sessions_business_reference_key"
    UNIQUE ("business_id", "reference"),
  CONSTRAINT "stocktake_sessions_business_id_key"
    UNIQUE ("business_id", "id")
);--> statement-breakpoint

CREATE INDEX "stocktake_sessions_business_created_idx"
  ON "stocktake_sessions" ("business_id", "created_at" DESC);--> statement-breakpoint

CREATE TABLE "stocktake_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" uuid NOT NULL,
  "session_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  -- On hand when the line was created: the audit baseline, not the delta's input.
  "expected_quantity" numeric(12, 3) NOT NULL,
  "counted_quantity" numeric(12, 3),
  -- Filled at finalise: the ledger sum then, and what the ledger received.
  "on_hand_before" numeric(12, 3),
  "applied_delta" numeric(12, 3),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "stocktake_lines_quantities_check"
    CHECK ("expected_quantity" >= 0
           AND ("counted_quantity" IS NULL OR "counted_quantity" >= 0)),
  CONSTRAINT "stocktake_lines_session_product_key"
    UNIQUE ("business_id", "session_id", "product_id"),
  CONSTRAINT "stocktake_lines_session_fk"
    FOREIGN KEY ("business_id", "session_id")
    REFERENCES "public"."stocktake_sessions" ("business_id", "id")
    ON DELETE cascade,
  -- Deferred so deleting a business is not sensitive to cascade order: products
  -- and this line's session are both removed by the same statement, and the line
  -- must still be allowed to see its product until the transaction ends.
  CONSTRAINT "stocktake_lines_product_fk"
    FOREIGN KEY ("business_id", "product_id")
    REFERENCES "public"."products" ("business_id", "id")
    DEFERRABLE INITIALLY DEFERRED
);--> statement-breakpoint

-- One adjustment per product per stocktake. The status check already refuses a
-- second finalise; this index is the second lock, at the ledger itself.
CREATE UNIQUE INDEX "stock_movements_stocktake_line_key"
  ON "stock_movements" ("business_id", "reference_id", "product_id")
  WHERE "reference_type" = 'stocktake';--> statement-breakpoint

ALTER TABLE "stocktake_sessions"
  ADD CONSTRAINT "stocktake_sessions_business_fk"
  FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id")
  ON DELETE cascade;--> statement-breakpoint

-- Never cascaded: the count sheet is evidence, so losing the starter's account
-- must not silently rewrite or remove it.
ALTER TABLE "stocktake_sessions"
  ADD CONSTRAINT "stocktake_sessions_started_by_fk"
  FOREIGN KEY ("started_by") REFERENCES "auth"."users"("id")
  ON DELETE no action;--> statement-breakpoint

ALTER TABLE "stocktake_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stocktake_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "stocktake_sessions_select" ON "stocktake_sessions"
  FOR SELECT TO "authenticated"
  USING (private.is_member("business_id"));--> statement-breakpoint
CREATE POLICY "stocktake_lines_select" ON "stocktake_lines"
  FOR SELECT TO "authenticated"
  USING (private.is_member("business_id"));--> statement-breakpoint

-- Read-only for the application role. The functions below are the write path.
GRANT SELECT ON "stocktake_sessions", "stocktake_lines" TO "authenticated";--> statement-breakpoint

-- Start a session and snapshot one line per active product in scope.
--   scope: { "category_id": "…", "search": "coffee" }  (either key optional)
-- The lines are built once, when the sheet is opened, so a product added to the
-- catalogue mid-session is deliberately absent.
CREATE OR REPLACE FUNCTION "private"."create_stocktake"(
  p_business_id uuid,
  p_scope jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE (session_id uuid, reference text, line_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_scope jsonb := coalesce(p_scope, '{}'::jsonb);
  v_category_raw text;
  v_category uuid;
  v_search text;
  v_reference text;
  v_session_id uuid;
  v_lines int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to start a stocktake.' USING ERRCODE = '42501';
  END IF;

  IF p_business_id IS NULL OR NOT private.is_member(p_business_id) THEN
    RAISE EXCEPTION 'That business is not yours.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT private.has_role(p_business_id, ARRAY['owner', 'staff']) THEN
    RAISE EXCEPTION 'You do not have permission to count stock in this business.'
      USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(v_scope) <> 'object' THEN
    RAISE EXCEPTION 'The stocktake filters are not valid.' USING ERRCODE = '22023';
  END IF;

  IF v_scope - 'category_id' - 'search' <> '{}'::jsonb THEN
    RAISE EXCEPTION 'The stocktake filters are not valid.' USING ERRCODE = '22023';
  END IF;

  v_category_raw := nullif(btrim(coalesce(v_scope ->> 'category_id', '')), '');
  IF v_category_raw IS NOT NULL
     AND v_category_raw !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'The stocktake filters are not valid.' USING ERRCODE = '22023';
  END IF;
  v_category := v_category_raw::uuid;

  v_search := nullif(btrim(coalesce(v_scope ->> 'search', '')), '');
  IF v_search IS NOT NULL AND length(v_search) > 80 THEN
    RAISE EXCEPTION 'Keep the stocktake search to 80 characters or fewer.'
      USING ERRCODE = '22023';
  END IF;

  -- One reference per business, in the order the sheets were started.
  SELECT 'ST-' || lpad((
           coalesce(max(substring(s.reference from 4)::int), 0) + 1
         )::text, 4, '0')
    INTO v_reference
    FROM stocktake_sessions s
   WHERE s.business_id = p_business_id;

  INSERT INTO stocktake_sessions (business_id, reference, scope, started_by)
  VALUES (p_business_id, v_reference, v_scope, auth.uid())
  RETURNING id INTO v_session_id;

  INSERT INTO stocktake_lines
    (business_id, session_id, product_id, expected_quantity)
  SELECT p.business_id, v_session_id, p.id, coalesce(st.on_hand, 0)
    FROM products p
    LEFT JOIN product_stock st
      ON st.business_id = p.business_id AND st.product_id = p.id
   WHERE p.business_id = p_business_id
     AND p.is_archived = false
     AND (v_category IS NULL OR p.category_id = v_category)
     -- position(), not ilike: a search ending in % must match a literal %, not
     -- become a wildcard.
     AND (v_search IS NULL
          OR position(lower(v_search) in lower(p.name)) > 0
          OR position(lower(v_search) in lower(p.sku)) > 0);
  GET DIAGNOSTICS v_lines = ROW_COUNT;

  IF v_lines = 0 THEN
    RAISE EXCEPTION 'No products match that stocktake scope.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY SELECT v_session_id, v_reference, v_lines;
END;
$$;--> statement-breakpoint

COMMENT ON FUNCTION "private"."create_stocktake"(uuid, jsonb)
  IS 'Opens a draft stocktake and snapshots on-hand for every active product in scope.';--> statement-breakpoint

REVOKE ALL ON FUNCTION "private"."create_stocktake"(uuid, jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "private"."create_stocktake"(uuid, jsonb) TO "authenticated";--> statement-breakpoint

-- Save the whole count sheet in one call. An entry with an empty count clears the
-- line back to "not counted"; a line the caller does not own is refused by name.
CREATE OR REPLACE FUNCTION "private"."save_stocktake_counts"(
  p_session_id uuid,
  p_counts jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
  v_status text;
  v_entry jsonb;
  v_line_id uuid;
  v_raw text;
  v_counted numeric;
  v_seen uuid[] := '{}';
BEGIN
  IF p_counts IS NULL
     OR jsonb_typeof(p_counts) <> 'array'
     OR jsonb_array_length(p_counts) > 500 THEN
    RAISE EXCEPTION 'The count sheet is not valid.' USING ERRCODE = '22023';
  END IF;

  SELECT s.business_id, s.status INTO v_business_id, v_status
    FROM stocktake_sessions s
   WHERE s.id = p_session_id
     FOR UPDATE;

  IF v_business_id IS NULL OR NOT private.is_member(v_business_id) THEN
    RAISE EXCEPTION 'That stocktake is not in this business.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT private.has_role(v_business_id, ARRAY['owner', 'staff']) THEN
    RAISE EXCEPTION 'You do not have permission to count stock in this business.'
      USING ERRCODE = '42501';
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Only a draft stocktake can be changed.' USING ERRCODE = '22023';
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_counts) LOOP
    IF jsonb_typeof(v_entry) <> 'object' THEN
      RAISE EXCEPTION 'The count sheet is not valid.' USING ERRCODE = '22023';
    END IF;

    v_line_id := (v_entry ->> 'line_id')::uuid;
    v_raw := nullif(btrim(coalesce(v_entry ->> 'counted', '')), '');

    IF v_line_id IS NULL THEN
      RAISE EXCEPTION 'Each count needs its stocktake line.' USING ERRCODE = '22023';
    END IF;
    -- Checked before the cast so a stray word is a readable refusal, not 22P02.
    IF v_raw IS NOT NULL AND v_raw !~ '^\d{1,9}(\.\d{1,3})?$' THEN
      RAISE EXCEPTION 'Enter the counted quantity as a number, for example 6 or 2.5.'
        USING ERRCODE = '22023';
    END IF;
    v_counted := v_raw::numeric;

    IF v_line_id = ANY (v_seen) THEN
      RAISE EXCEPTION 'Each stocktake line can appear once.' USING ERRCODE = '22023';
    END IF;
    v_seen := v_seen || v_line_id;

    UPDATE stocktake_lines
       SET counted_quantity = v_counted
     WHERE business_id = v_business_id
       AND session_id = p_session_id
       AND id = v_line_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'That line is not on this stocktake.' USING ERRCODE = '22023';
    END IF;
  END LOOP;
END;
$$;--> statement-breakpoint

COMMENT ON FUNCTION "private"."save_stocktake_counts"(uuid, jsonb)
  IS 'Sets or clears counted quantities on a draft stocktake, refusing lines from another sheet.';--> statement-breakpoint

REVOKE ALL ON FUNCTION "private"."save_stocktake_counts"(uuid, jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "private"."save_stocktake_counts"(uuid, jsonb) TO "authenticated";--> statement-breakpoint

-- Finalise: one adjustment per counted product whose count differs from the live
-- ledger sum. Products are locked before their sum is read, so a concurrent
-- movement serialises behind the count rather than being silently overwritten.
CREATE OR REPLACE FUNCTION "private"."complete_stocktake"(
  p_session_id uuid
) RETURNS TABLE (counted_lines int, adjusted_lines int, net_delta numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
  v_status text;
  v_reference text;
  v_line record;
  v_on_hand numeric;
  v_delta numeric;
  v_counted_lines int := 0;
  v_adjusted_lines int := 0;
  v_net_delta numeric := 0;
BEGIN
  SELECT s.business_id, s.status, s.reference
    INTO v_business_id, v_status, v_reference
    FROM stocktake_sessions s
   WHERE s.id = p_session_id
     FOR UPDATE;

  IF v_business_id IS NULL OR NOT private.is_member(v_business_id) THEN
    RAISE EXCEPTION 'That stocktake is not in this business.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT private.has_role(v_business_id, ARRAY['owner', 'staff']) THEN
    RAISE EXCEPTION 'You do not have permission to count stock in this business.'
      USING ERRCODE = '42501';
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Only a draft stocktake can be completed.' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::int INTO v_counted_lines
    FROM stocktake_lines l
   WHERE l.business_id = v_business_id
     AND l.session_id = p_session_id
     AND l.counted_quantity IS NOT NULL;

  IF v_counted_lines = 0 THEN
    RAISE EXCEPTION 'Count at least one product before completing the stocktake.'
      USING ERRCODE = '22023';
  END IF;

  FOR v_line IN
    SELECT l.id, l.product_id, l.counted_quantity
      FROM stocktake_lines l
     WHERE l.business_id = v_business_id
       AND l.session_id = p_session_id
       AND l.counted_quantity IS NOT NULL
     ORDER BY l.product_id
  LOOP
    PERFORM 1
       FROM products p
      WHERE p.business_id = v_business_id AND p.id = v_line.product_id
        FOR UPDATE;

    SELECT coalesce(sum(m.quantity_delta), 0) INTO v_on_hand
      FROM stock_movements m
     WHERE m.business_id = v_business_id AND m.product_id = v_line.product_id;

    v_delta := v_line.counted_quantity - v_on_hand;

    UPDATE stocktake_lines
       SET on_hand_before = v_on_hand, applied_delta = v_delta
     WHERE id = v_line.id;

    IF v_delta <> 0 THEN
      INSERT INTO stock_movements
        (business_id, product_id, movement_type, quantity_delta, reason,
         reference_type, reference_id, created_by)
      VALUES
        (v_business_id, v_line.product_id, 'adjustment', v_delta,
         'Stocktake ' || v_reference, 'stocktake', p_session_id, auth.uid());
      v_adjusted_lines := v_adjusted_lines + 1;
      v_net_delta := v_net_delta + v_delta;
    END IF;
  END LOOP;

  UPDATE stocktake_sessions
     SET status = 'completed', completed_at = now()
   WHERE id = p_session_id;

  RETURN QUERY SELECT v_counted_lines, v_adjusted_lines, trim_scale(v_net_delta);
END;
$$;--> statement-breakpoint

COMMENT ON FUNCTION "private"."complete_stocktake"(uuid)
  IS 'Posts one adjustment per counted product from the live ledger sum and marks the session complete.';--> statement-breakpoint

REVOKE ALL ON FUNCTION "private"."complete_stocktake"(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "private"."complete_stocktake"(uuid) TO "authenticated";--> statement-breakpoint

-- The demo reset restores the baseline catalogue and ledger. A stocktake line
-- references a product without a cascade, so both stocktake tables must be cleared
-- before products are deleted; this re-creates the function from `0016` with those
-- two statements added.
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
  DELETE FROM stocktake_lines        WHERE business_id = p_business_id;
  DELETE FROM stocktake_sessions     WHERE business_id = p_business_id;
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
