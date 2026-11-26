-- Slice H review fix: a demo reset clears import history.
--
-- `csv_imports` is the history of the runs that created the products and suppliers
-- a reset deletes. The activity feed was already cleared for the same reason; the
-- history table was missed, so Recent imports still listed runs whose products no
-- longer existed. This re-creates the reset from 0019 with one DELETE added and
-- changes nothing else.

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
  DELETE FROM csv_imports            WHERE business_id = p_business_id;
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
$$;
