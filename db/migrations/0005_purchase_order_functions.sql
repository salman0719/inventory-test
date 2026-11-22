-- Slice 7: purchase orders and transactional receiving (Gate C DC6).
--
-- Two fields stop being writable by the application role:
-- * purchase_orders.status / ordered_at — only private.set_purchase_order_status
--   moves an order through the approved transitions;
-- * purchase_order_lines.received_quantity — only the receiving function raises it.
-- A draft's supplier, dates, notes and lines stay editable by owner or staff, and
-- only while the order is still a draft. `received_quantity` is a cache; receipt
-- lines remain the truth.

-- 1. Helpers the policies and the order lifecycle use.
CREATE OR REPLACE FUNCTION "private"."is_draft_order"(p_order_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM purchase_orders po
    WHERE po.id = p_order_id AND po.status = 'draft'
  );
$$;--> statement-breakpoint
COMMENT ON FUNCTION "private"."is_draft_order"(uuid)
  IS 'RLS helper: true when the order exists and is still a draft.';--> statement-breakpoint

CREATE OR REPLACE FUNCTION "private"."set_purchase_order_status"(
  p_purchase_order_id uuid,
  p_status text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
  v_current text;
BEGIN
  SELECT po.business_id, po.status INTO v_business_id, v_current
    FROM purchase_orders po
   WHERE po.id = p_purchase_order_id
     FOR UPDATE;

  -- One message for absent and foreign orders: the function runs as its owner, so
  -- it must not become an existence oracle.
  IF v_business_id IS NULL OR NOT private.is_member(v_business_id) THEN
    RAISE EXCEPTION 'That order is not in this business.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT private.has_role(v_business_id, ARRAY['owner', 'staff']) THEN
    RAISE EXCEPTION 'You do not have permission to change orders in this business.'
      USING ERRCODE = '42501';
  END IF;

  IF p_status = 'ordered' AND v_current = 'draft' THEN
    UPDATE purchase_orders
       SET status = 'ordered', ordered_at = now(), updated_at = now()
     WHERE id = p_purchase_order_id;
  ELSIF p_status = 'cancelled'
        AND v_current IN ('draft', 'ordered', 'partially_received') THEN
    UPDATE purchase_orders
       SET status = 'cancelled', updated_at = now()
     WHERE id = p_purchase_order_id;
  ELSE
    RAISE EXCEPTION 'An order that is % cannot be marked %.',
      replace(v_current, '_', ' '), p_status
      USING ERRCODE = '22023';
  END IF;

  RETURN p_status;
END;
$$;--> statement-breakpoint
COMMENT ON FUNCTION "private"."set_purchase_order_status"(uuid, text)
  IS 'Moves a purchase order between the approved statuses and records when it was ordered.';--> statement-breakpoint

CREATE OR REPLACE FUNCTION "private"."receive_purchase_order"(
  p_purchase_order_id uuid,
  p_lines jsonb,
  p_idempotency_key uuid
) RETURNS TABLE (receipt_id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
  v_order_status text;
  v_order_number text;
  v_replayed_receipt uuid;
  v_line_ids uuid[] := '{}';
  v_quantities numeric[] := '{}';
  v_entry jsonb;
  v_index int;
  v_found int;
  v_line_id uuid;
  v_product_id uuid;
  v_product_name text;
  v_unit text;
  v_ordered numeric;
  v_received numeric;
  v_unit_cost numeric;
  v_quantity numeric;
  v_outstanding numeric;
  v_outstanding_lines int;
  v_receipt_id uuid;
BEGIN
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'A receipt needs an idempotency key.' USING ERRCODE = '22023';
  END IF;

  IF p_lines IS NULL
     OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Enter a quantity for at least one line.' USING ERRCODE = '22023';
  END IF;

  -- Lock the order first. Two receivers of the same delivery queue here, and the
  -- second re-reads the status after the first commits instead of over-receiving.
  SELECT po.business_id, po.status, po.order_number
    INTO v_business_id, v_order_status, v_order_number
    FROM purchase_orders po
   WHERE po.id = p_purchase_order_id
     FOR UPDATE;

  IF v_business_id IS NULL OR NOT private.is_member(v_business_id) THEN
    RAISE EXCEPTION 'That order is not in this business.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT private.has_role(v_business_id, ARRAY['owner', 'staff']) THEN
    RAISE EXCEPTION 'You do not have permission to receive stock in this business.'
      USING ERRCODE = '42501';
  END IF;

  -- Replay before the status check: a double submission returns its first receipt
  -- and writes nothing, even when that submission completed the order.
  SELECT r.id INTO v_replayed_receipt
    FROM purchase_receipts r
   WHERE r.business_id = v_business_id
     AND r.idempotency_key = p_idempotency_key;

  IF v_replayed_receipt IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM purchase_receipts r
       WHERE r.id = v_replayed_receipt
         AND r.purchase_order_id = p_purchase_order_id
    ) THEN
      RAISE EXCEPTION 'That receipt key belongs to another order.' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT v_replayed_receipt, v_order_status;
    RETURN;
  END IF;

  IF v_order_status NOT IN ('ordered', 'partially_received') THEN
    RAISE EXCEPTION 'Only an ordered or partly received order can receive stock.'
      USING ERRCODE = '22023';
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_line_id := (v_entry ->> 'purchase_order_line_id')::uuid;
    v_quantity := (v_entry ->> 'quantity')::numeric;

    IF v_line_id IS NULL THEN
      RAISE EXCEPTION 'Each receipt line needs an order line.' USING ERRCODE = '22023';
    END IF;
    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Enter a quantity above zero.' USING ERRCODE = '22023';
    END IF;
    -- Without this, the same line twice could each pass the outstanding check and
    -- double-post stock.
    IF v_line_id = ANY (v_line_ids) THEN
      RAISE EXCEPTION 'Each order line can appear once in a receipt.' USING ERRCODE = '22023';
    END IF;

    v_line_ids := v_line_ids || v_line_id;
    v_quantities := v_quantities || v_quantity;
  END LOOP;

  PERFORM 1
     FROM purchase_order_lines l
    WHERE l.business_id = v_business_id
      AND l.purchase_order_id = p_purchase_order_id
      AND l.id = ANY (v_line_ids)
    ORDER BY l.id
    FOR UPDATE;
  GET DIAGNOSTICS v_found = ROW_COUNT;

  IF v_found <> array_length(v_line_ids, 1) THEN
    RAISE EXCEPTION 'That line is not on this order.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO purchase_receipts
    (business_id, purchase_order_id, received_by, idempotency_key)
  VALUES
    (v_business_id, p_purchase_order_id, auth.uid(), p_idempotency_key)
  RETURNING id INTO v_receipt_id;

  FOR v_index IN 1 .. array_length(v_line_ids, 1) LOOP
    SELECT l.product_id, p.name, p.unit_of_measure, l.quantity_ordered,
           l.received_quantity, l.unit_cost
      INTO v_product_id, v_product_name, v_unit, v_ordered, v_received, v_unit_cost
      FROM purchase_order_lines l
      JOIN products p ON p.business_id = l.business_id AND p.id = l.product_id
     WHERE l.id = v_line_ids[v_index];

    v_quantity := v_quantities[v_index];
    v_outstanding := v_ordered - v_received;

    -- Over-receipt is rejected rather than clamped: accepting more than was
    -- ordered needs an approved rule, and the form is pre-filled with what is due.
    IF v_quantity > v_outstanding THEN
      RAISE EXCEPTION 'Only % % of % is outstanding on this order.',
        trim_scale(v_outstanding), v_unit, v_product_name
        USING ERRCODE = '23514';
    END IF;

    INSERT INTO purchase_receipt_lines
      (business_id, receipt_id, purchase_order_line_id, quantity_received,
       unit_cost)
    VALUES
      (v_business_id, v_receipt_id, v_line_ids[v_index], v_quantity, v_unit_cost);

    INSERT INTO stock_movements
      (business_id, product_id, movement_type, quantity_delta, reason,
       reference_type, reference_id, unit_cost, created_by)
    VALUES
      (v_business_id, v_product_id, 'received', v_quantity,
       'Received on ' || v_order_number, 'purchase_receipt', v_receipt_id,
       v_unit_cost, auth.uid());

    UPDATE purchase_order_lines
       SET received_quantity = received_quantity + v_quantity, updated_at = now()
     WHERE id = v_line_ids[v_index];
  END LOOP;

  SELECT count(*)::int INTO v_outstanding_lines
    FROM purchase_order_lines l
   WHERE l.business_id = v_business_id
     AND l.purchase_order_id = p_purchase_order_id
     AND l.received_quantity < l.quantity_ordered;

  v_order_status := CASE
    WHEN v_outstanding_lines = 0 THEN 'received'
    ELSE 'partially_received'
  END;

  UPDATE purchase_orders
     SET status = v_order_status, updated_at = now()
   WHERE id = p_purchase_order_id;

  RETURN QUERY SELECT v_receipt_id, v_order_status;
END;
$$;--> statement-breakpoint
COMMENT ON FUNCTION "private"."receive_purchase_order"(uuid, jsonb, uuid)
  IS 'Receives one delivery atomically: receipt, receipt lines, stock movements, line balances and order status.';--> statement-breakpoint

-- 2. Column-level grants. Status, ordered_at and received_quantity are not in the
--    lists, so a crafted request cannot mark an order received or claim a receipt
--    without the functions above.
REVOKE INSERT, UPDATE ON "purchase_orders" FROM "authenticated";--> statement-breakpoint
GRANT INSERT ("business_id", "supplier_id", "order_number",
              "expected_delivery_at", "notes")
  ON "purchase_orders" TO "authenticated";--> statement-breakpoint
GRANT UPDATE ("supplier_id", "expected_delivery_at", "notes", "updated_at")
  ON "purchase_orders" TO "authenticated";--> statement-breakpoint

REVOKE INSERT, UPDATE ON "purchase_order_lines" FROM "authenticated";--> statement-breakpoint
GRANT INSERT ("business_id", "purchase_order_id", "product_id",
              "quantity_ordered", "unit_cost")
  ON "purchase_order_lines" TO "authenticated";--> statement-breakpoint
GRANT UPDATE ("product_id", "quantity_ordered", "unit_cost", "updated_at")
  ON "purchase_order_lines" TO "authenticated";--> statement-breakpoint
-- Draft lines can be removed and re-added; receiving only ever runs on an order
-- that has left draft, and receipt lines reference the rows it keeps.
GRANT DELETE ON "purchase_order_lines" TO "authenticated";--> statement-breakpoint

-- 3. Drafts are the only place the application role may edit an order or its lines.
DROP POLICY "purchase_orders_update" ON "purchase_orders";--> statement-breakpoint
CREATE POLICY "purchase_orders_update" ON "purchase_orders" FOR UPDATE TO "authenticated"
  USING (private.has_role(business_id, ARRAY['owner', 'staff']) AND status = 'draft')
  WITH CHECK (private.has_role(business_id, ARRAY['owner', 'staff']) AND status = 'draft');--> statement-breakpoint

DROP POLICY "purchase_order_lines_insert" ON "purchase_order_lines";--> statement-breakpoint
CREATE POLICY "purchase_order_lines_insert" ON "purchase_order_lines" FOR INSERT TO "authenticated"
  WITH CHECK (private.has_role(business_id, ARRAY['owner', 'staff'])
              AND private.is_draft_order(purchase_order_id));--> statement-breakpoint
DROP POLICY "purchase_order_lines_update" ON "purchase_order_lines";--> statement-breakpoint
CREATE POLICY "purchase_order_lines_update" ON "purchase_order_lines" FOR UPDATE TO "authenticated"
  USING (private.has_role(business_id, ARRAY['owner', 'staff'])
         AND private.is_draft_order(purchase_order_id))
  WITH CHECK (private.has_role(business_id, ARRAY['owner', 'staff'])
              AND private.is_draft_order(purchase_order_id));--> statement-breakpoint
CREATE POLICY "purchase_order_lines_delete" ON "purchase_order_lines" FOR DELETE TO "authenticated"
  USING (private.has_role(business_id, ARRAY['owner', 'staff'])
         AND private.is_draft_order(purchase_order_id));--> statement-breakpoint

-- 4. Execute rights: PUBLIC loses them, the signed-in role gets the two writes and
--    the policy helper.
REVOKE ALL ON FUNCTION "private"."is_draft_order"(uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "private"."set_purchase_order_status"(uuid, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "private"."receive_purchase_order"(uuid, jsonb, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "private"."is_draft_order"(uuid) TO "authenticated";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "private"."set_purchase_order_status"(uuid, text) TO "authenticated";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "private"."receive_purchase_order"(uuid, jsonb, uuid) TO "authenticated";
