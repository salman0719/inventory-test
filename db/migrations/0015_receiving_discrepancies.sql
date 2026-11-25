-- Slice B: receiving discrepancies and closing short.
--
-- quantity_received becomes "arrived" (accepted + damaged + rejected); only
-- quantity_accepted reaches the ledger, because stock you cannot sell is not stock.
-- Every receipt written before this migration was fully accepted, which is what the
-- backfill says.

ALTER TABLE "purchase_receipt_lines"
  ADD COLUMN "quantity_accepted" numeric(12, 3) NOT NULL DEFAULT 0,
  ADD COLUMN "quantity_damaged" numeric(12, 3) NOT NULL DEFAULT 0,
  ADD COLUMN "quantity_rejected" numeric(12, 3) NOT NULL DEFAULT 0,
  ADD COLUMN "discrepancy_reason" text;--> statement-breakpoint

UPDATE "purchase_receipt_lines"
   SET "quantity_accepted" = "quantity_received"
 WHERE "quantity_accepted" = 0;--> statement-breakpoint

ALTER TABLE "purchase_receipt_lines"
  ADD CONSTRAINT "purchase_receipt_lines_breakdown_check"
    CHECK ("quantity_received" = "quantity_accepted" + "quantity_damaged" + "quantity_rejected"),
  ADD CONSTRAINT "purchase_receipt_lines_parts_check"
    CHECK ("quantity_accepted" >= 0 AND "quantity_damaged" >= 0 AND "quantity_rejected" >= 0);--> statement-breakpoint

-- Closing short is recorded on the order itself, next to the status it explains.
ALTER TABLE "purchase_orders"
  ADD COLUMN "closed_short_at" timestamp with time zone,
  ADD COLUMN "close_reason" text;--> statement-breakpoint

-- The receiving payload now carries the breakdown:
--   { "purchase_order_line_id": "…", "received": 8, "accepted": 7,
--     "damaged": 1, "rejected": 0, "reason": "One tub crushed in transit" }
-- The order line's received_quantity still rises by `received`, so "outstanding" is
-- ordered minus arrived, while the ledger only ever sees `accepted`.
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
  v_entries jsonb[] := '{}';
  v_entry jsonb;
  v_index int;
  v_found int;
  v_line_id uuid;
  v_product_id uuid;
  v_product_name text;
  v_unit text;
  v_ordered numeric;
  v_arrived numeric;
  v_unit_cost numeric;
  v_received numeric;
  v_accepted numeric;
  v_damaged numeric;
  v_rejected numeric;
  v_reason text;
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

  -- Validate every line before writing anything: a bad entry must leave no receipt.
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_line_id := (v_entry ->> 'purchase_order_line_id')::uuid;
    v_received := (v_entry ->> 'received')::numeric;
    v_accepted := coalesce((v_entry ->> 'accepted')::numeric, 0);
    v_damaged := coalesce((v_entry ->> 'damaged')::numeric, 0);
    v_rejected := coalesce((v_entry ->> 'rejected')::numeric, 0);
    v_reason := nullif(btrim(coalesce(v_entry ->> 'reason', '')), '');

    IF v_line_id IS NULL THEN
      RAISE EXCEPTION 'Each receipt line needs an order line.' USING ERRCODE = '22023';
    END IF;
    IF v_received IS NULL OR v_received <= 0 THEN
      RAISE EXCEPTION 'Enter a quantity above zero.' USING ERRCODE = '22023';
    END IF;
    IF v_accepted < 0 OR v_damaged < 0 OR v_rejected < 0 THEN
      RAISE EXCEPTION 'Accepted, damaged and rejected cannot be negative.'
        USING ERRCODE = '22023';
    END IF;
    IF v_accepted + v_damaged + v_rejected <> v_received THEN
      RAISE EXCEPTION 'Accepted, damaged and rejected must add up to what arrived.'
        USING ERRCODE = '22023';
    END IF;
    IF (v_damaged + v_rejected) > 0 AND v_reason IS NULL THEN
      RAISE EXCEPTION 'Say what was wrong with the delivery.' USING ERRCODE = '22023';
    END IF;
    IF length(v_reason) > 500 THEN
      RAISE EXCEPTION 'Keep the note to 500 characters or fewer.' USING ERRCODE = '22023';
    END IF;
    -- Without this, the same line twice could each pass the outstanding check and
    -- double-post stock.
    IF v_line_id = ANY (v_line_ids) THEN
      RAISE EXCEPTION 'Each order line can appear once in a receipt.' USING ERRCODE = '22023';
    END IF;

    v_line_ids := v_line_ids || v_line_id;
    v_entries := v_entries || v_entry;
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
    v_entry := v_entries[v_index];
    v_received := (v_entry ->> 'received')::numeric;
    v_accepted := coalesce((v_entry ->> 'accepted')::numeric, 0);
    v_damaged := coalesce((v_entry ->> 'damaged')::numeric, 0);
    v_rejected := coalesce((v_entry ->> 'rejected')::numeric, 0);
    v_reason := nullif(btrim(coalesce(v_entry ->> 'reason', '')), '');

    SELECT l.product_id, p.name, p.unit_of_measure, l.quantity_ordered,
           l.received_quantity, l.unit_cost
      INTO v_product_id, v_product_name, v_unit, v_ordered, v_arrived, v_unit_cost
      FROM purchase_order_lines l
      JOIN products p ON p.business_id = l.business_id AND p.id = l.product_id
     WHERE l.id = v_line_ids[v_index];

    v_outstanding := v_ordered - v_arrived;

    -- Over-receipt is rejected rather than clamped: accepting more than was
    -- ordered needs an approved rule, and the form is pre-filled with what is due.
    IF v_received > v_outstanding THEN
      RAISE EXCEPTION 'Only % % of % is outstanding on this order.',
        trim_scale(v_outstanding), v_unit, v_product_name
        USING ERRCODE = '23514';
    END IF;

    INSERT INTO purchase_receipt_lines
      (business_id, receipt_id, purchase_order_line_id, quantity_received,
       quantity_accepted, quantity_damaged, quantity_rejected,
       discrepancy_reason, unit_cost)
    VALUES
      (v_business_id, v_receipt_id, v_line_ids[v_index], v_received,
       v_accepted, v_damaged, v_rejected, v_reason, v_unit_cost);

    -- Nothing usable arrived, so there is nothing to add to the ledger:
    -- stock_movements forbids a zero delta, which is the constraint doing its job.
    IF v_accepted > 0 THEN
      INSERT INTO stock_movements
        (business_id, product_id, movement_type, quantity_delta, reason,
         reference_type, reference_id, unit_cost, created_by)
      VALUES
        (v_business_id, v_product_id, 'received', v_accepted,
         'Received on ' || v_order_number, 'purchase_receipt', v_receipt_id,
         v_unit_cost, auth.uid());
    END IF;

    UPDATE purchase_order_lines
       SET received_quantity = received_quantity + v_received, updated_at = now()
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
  IS 'Receives one delivery atomically, splitting arrived stock into accepted, damaged and rejected; only accepted reaches the ledger.';--> statement-breakpoint

-- A short delivery plus one open order per supplier would otherwise block that
-- supplier until the order was cancelled and re-drafted, losing its history. This
-- closes the remainder without touching the line balances.
CREATE OR REPLACE FUNCTION "private"."close_purchase_order_short"(
  p_purchase_order_id uuid,
  p_reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
  v_status text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  SELECT po.business_id, po.status INTO v_business_id, v_status
    FROM purchase_orders po
   WHERE po.id = p_purchase_order_id
     FOR UPDATE;

  IF v_business_id IS NULL OR NOT private.is_member(v_business_id) THEN
    RAISE EXCEPTION 'That order is not in this business.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT private.has_role(v_business_id, ARRAY['owner', 'staff']) THEN
    RAISE EXCEPTION 'You do not have permission to change orders in this business.'
      USING ERRCODE = '42501';
  END IF;

  IF v_status <> 'partially_received' THEN
    RAISE EXCEPTION 'Only a partly received order can be closed short.'
      USING ERRCODE = '22023';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Say why the order is closing short.' USING ERRCODE = '22023';
  END IF;

  IF length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Keep the note to 500 characters or fewer.' USING ERRCODE = '22023';
  END IF;

  UPDATE purchase_orders
     SET status = 'received', closed_short_at = now(), close_reason = v_reason,
         updated_at = now()
   WHERE id = p_purchase_order_id;
END;
$$;--> statement-breakpoint
COMMENT ON FUNCTION "private"."close_purchase_order_short"(uuid, text)
  IS 'Closes a partly received order without receiving the remainder, recording why.';--> statement-breakpoint

REVOKE ALL ON FUNCTION "private"."close_purchase_order_short"(uuid, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "private"."close_purchase_order_short"(uuid, text) TO "authenticated";
