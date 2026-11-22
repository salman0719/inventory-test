-- Stock ledger writes (Gate C DC5): this function is the only path that appends to
-- stock_movements. `authenticated` keeps its read-only grant from 0002.
--
-- On-hand stays derived (DC2): the function appends a signed delta and returns the
-- new total; nothing writes a quantity onto products. Stock cannot go below zero
-- because the product row is locked before the sum is recomputed, so two concurrent
-- movements for one product serialise instead of racing a read-then-write check.

CREATE OR REPLACE FUNCTION "private"."record_stock_movement"(
  p_product_id uuid,
  p_movement_type text,
  p_quantity_delta numeric,
  p_reason text DEFAULT NULL
) RETURNS TABLE (movement_id uuid, on_hand numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
  v_on_hand numeric;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_movement_id uuid;
BEGIN
  -- 'opening' is deliberately excluded: it belongs to the seed and a future
  -- stock-take, not to the manual movement form.
  IF p_movement_type IS NULL
     OR p_movement_type NOT IN ('stock_in', 'stock_out', 'adjustment') THEN
    RAISE EXCEPTION 'Unsupported stock movement type: %', p_movement_type
      USING ERRCODE = '22023';
  END IF;

  IF p_quantity_delta IS NULL OR p_quantity_delta = 0 THEN
    RAISE EXCEPTION 'A stock movement needs a non-zero quantity.'
      USING ERRCODE = '22023';
  END IF;

  IF p_movement_type = 'adjustment' AND v_reason IS NULL THEN
    RAISE EXCEPTION 'An adjustment needs a reason.'
      USING ERRCODE = '22023';
  END IF;

  -- Lock the product so the sum below cannot be overtaken by a concurrent movement.
  SELECT p.business_id INTO v_business_id
    FROM products p
   WHERE p.id = p_product_id
     FOR UPDATE;

  -- The same message whether the row is absent or belongs to another tenant: the
  -- function runs as its owner, so it must not become an existence oracle.
  IF v_business_id IS NULL OR NOT private.is_member(v_business_id) THEN
    RAISE EXCEPTION 'That product is not in this business.'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT private.has_role(v_business_id, ARRAY['owner', 'staff']) THEN
    RAISE EXCEPTION 'You do not have permission to change stock in this business.'
      USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(sum(m.quantity_delta), 0) INTO v_on_hand
    FROM stock_movements m
   WHERE m.business_id = v_business_id AND m.product_id = p_product_id;

  IF v_on_hand + p_quantity_delta < 0 THEN
    RAISE EXCEPTION 'That would leave % on hand; stock cannot go below zero.',
      v_on_hand + p_quantity_delta
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO stock_movements
    (business_id, product_id, movement_type, quantity_delta, reason,
     reference_type, created_by)
  VALUES
    (v_business_id, p_product_id, p_movement_type, p_quantity_delta, v_reason,
     'manual', auth.uid())
  RETURNING id INTO v_movement_id;

  RETURN QUERY SELECT v_movement_id, v_on_hand + p_quantity_delta;
END;
$$;--> statement-breakpoint

COMMENT ON FUNCTION "private"."record_stock_movement"(uuid, text, numeric, text)
  IS 'Appends one manual stock movement for an owner or staff member and returns the new on-hand total.';--> statement-breakpoint

REVOKE ALL ON FUNCTION "private"."record_stock_movement"(uuid, text, numeric, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "private"."record_stock_movement"(uuid, text, numeric, text) TO "authenticated";
