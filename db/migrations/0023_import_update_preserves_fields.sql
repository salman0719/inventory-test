-- Slice H review fix: a product update keeps every field the file does not carry.
--
-- Opening stock was already creation-only, but an update wrote the whole product
-- row: a price list with only name, SKU and cost cleared the barcode, category,
-- description, selling price and target stock, and reset the unit to 'ea' and the
-- reorder level to 0. The supplier import already treats a blank cell as "keep the
-- stored value"; this makes products match it. A blank optional cell - whether the
-- column is missing or the cell is empty - leaves the column alone. A new product
-- still gets the defaults (ea, 0, 0). Clearing a value is done in the product form;
-- the import cannot blank one.
--
-- The function is otherwise unchanged from 0021, including the opening-stock
-- refusal, the supplier link and the one-event history row.

CREATE OR REPLACE FUNCTION "private"."import_products"(
  p_business_id uuid,
  p_rows jsonb,
  p_options jsonb,
  p_idempotency_key uuid,
  p_filename text,
  p_total_rows int
) RETURNS TABLE (
  import_id uuid,
  imported int,
  updated int,
  skipped int,
  opening_movements int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_options jsonb := coalesce(p_options, '{}'::jsonb);
  v_update_existing boolean := false;
  v_create_suppliers boolean := false;
  v_create_categories boolean := false;
  v_default_supplier uuid;
  v_row jsonb;
  v_row_count int;
  v_import_id uuid;
  v_imported int := 0;
  v_updated int := 0;
  v_openings int := 0;
  v_skipped int := 0;
  -- Kept apart from the working counters: a SELECT INTO with no row nulls its
  -- targets, and the replay check below deliberately finds no row on a first run.
  v_replay_id uuid;
  v_replay_imported int;
  v_replay_updated int;
  v_replay_skipped int;
  v_replay_openings int;
  v_line int;
  v_name text;
  v_sku text;
  v_barcode text;
  v_unit text;
  v_category_name text;
  v_supplier_name text;
  v_supplier_sku text;
  v_description text;
  v_cost numeric;
  v_selling numeric;
  v_reorder numeric;
  v_target numeric;
  v_opening numeric;
  v_supplier_id uuid;
  v_supplier_matches int;
  v_category_id uuid;
  v_product_id uuid;
  v_existing_id uuid;
  v_new_categories text[] := '{}';
  v_new_suppliers text[] := '{}';
  v_seen_skus text[] := '{}';
  v_summary text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to import products.' USING ERRCODE = '42501';
  END IF;

  IF p_business_id IS NULL OR NOT private.is_member(p_business_id) THEN
    RAISE EXCEPTION 'That business is not yours.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT private.has_role(p_business_id, ARRAY['owner', 'staff']) THEN
    RAISE EXCEPTION 'You do not have permission to import products in this business.'
      USING ERRCODE = '42501';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'The imported rows are missing.' USING ERRCODE = '22023';
  END IF;

  v_row_count := jsonb_array_length(p_rows);
  IF v_row_count < 1 OR v_row_count > 500 THEN
    RAISE EXCEPTION 'An import must contain between 1 and 500 rows.'
      USING ERRCODE = '22023';
  END IF;

  IF p_total_rows IS NULL OR p_total_rows < v_row_count OR p_total_rows > 500 THEN
    RAISE EXCEPTION 'The import row count is not valid.' USING ERRCODE = '22023';
  END IF;

  IF p_filename IS NULL OR btrim(p_filename) = ''
     OR char_length(p_filename) > 200 THEN
    RAISE EXCEPTION 'Give the import a file name of 200 characters or fewer.'
      USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'The import key is missing.' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(v_options) <> 'object' THEN
    RAISE EXCEPTION 'The import options are not valid.' USING ERRCODE = '22023';
  END IF;

  -- A replay returns the first result and writes nothing. Checked before the
  -- duplicate-SKU rule, so resubmitting the same file is not an error.
  SELECT ci.id, ci.imported_rows, ci.updated_rows, ci.skipped_rows,
         ci.opening_movements
    INTO v_replay_id, v_replay_imported, v_replay_updated, v_replay_skipped,
         v_replay_openings
    FROM csv_imports ci
   WHERE ci.business_id = p_business_id
     AND ci.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN QUERY SELECT v_replay_id, v_replay_imported, v_replay_updated,
                        v_replay_skipped, v_replay_openings;
    RETURN;
  END IF;

  v_update_existing := coalesce((v_options ->> 'updateExisting')::boolean, false);
  v_create_suppliers := coalesce((v_options ->> 'createSuppliers')::boolean, false);
  v_create_categories := coalesce((v_options ->> 'createCategories')::boolean, false);

  v_default_supplier := nullif(
    btrim(coalesce(v_options ->> 'defaultSupplierId', '')), ''
  )::uuid;

  IF v_default_supplier IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM suppliers s
     WHERE s.business_id = p_business_id AND s.id = v_default_supplier
  ) THEN
    RAISE EXCEPTION 'The chosen supplier is not in this business.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO csv_imports
    (business_id, kind, filename, idempotency_key, total_rows, created_by)
  VALUES
    (p_business_id, 'products', btrim(p_filename), p_idempotency_key,
     p_total_rows, auth.uid())
  RETURNING id INTO v_import_id;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF jsonb_typeof(v_row) <> 'object' THEN
      RAISE EXCEPTION 'An imported row is not valid.' USING ERRCODE = '22023';
    END IF;

    v_line := coalesce(nullif(v_row ->> 'rowNumber', '')::int, 0);

    v_name := regexp_replace(btrim(coalesce(v_row ->> 'name', '')), '\s+', ' ', 'g');
    IF v_name = '' OR char_length(v_name) > 120 THEN
      RAISE EXCEPTION 'Row %: enter a product name of 120 characters or fewer.',
        v_line USING ERRCODE = '22023';
    END IF;

    v_sku := upper(btrim(coalesce(v_row ->> 'sku', '')));
    IF v_sku !~ '^[A-Z0-9._-]{1,40}$' THEN
      RAISE EXCEPTION 'Row %: enter a SKU of letters, numbers, dots, dashes or underscores.',
        v_line USING ERRCODE = '22023';
    END IF;
    IF v_sku = ANY (v_seen_skus) THEN
      RAISE EXCEPTION 'Row %: SKU % appears more than once in this file.',
        v_line, v_sku USING ERRCODE = '22023';
    END IF;
    v_seen_skus := v_seen_skus || v_sku;

    v_barcode := nullif(btrim(coalesce(v_row ->> 'barcode', '')), '');
    IF v_barcode IS NOT NULL AND char_length(v_barcode) > 80 THEN
      RAISE EXCEPTION 'Row %: keep the barcode to 80 characters or fewer.',
        v_line USING ERRCODE = '22023';
    END IF;

    v_unit := nullif(btrim(coalesce(v_row ->> 'unit', '')), '');
    IF v_unit IS NOT NULL AND char_length(v_unit) > 12 THEN
      RAISE EXCEPTION 'Row %: keep the unit to 12 characters or fewer.',
        v_line USING ERRCODE = '22023';
    END IF;

    v_category_name := nullif(btrim(coalesce(v_row ->> 'category', '')), '');
    IF v_category_name IS NOT NULL AND char_length(v_category_name) > 120 THEN
      RAISE EXCEPTION 'Row %: keep the category to 120 characters or fewer.',
        v_line USING ERRCODE = '22023';
    END IF;

    v_supplier_name := nullif(btrim(coalesce(v_row ->> 'supplier', '')), '');
    IF v_supplier_name IS NOT NULL AND char_length(v_supplier_name) > 120 THEN
      RAISE EXCEPTION 'Row %: keep the supplier name to 120 characters or fewer.',
        v_line USING ERRCODE = '22023';
    END IF;

    v_supplier_sku := nullif(btrim(coalesce(v_row ->> 'supplierSku', '')), '');
    IF v_supplier_sku IS NOT NULL AND char_length(v_supplier_sku) > 60 THEN
      RAISE EXCEPTION 'Row %: keep the supplier SKU to 60 characters or fewer.',
        v_line USING ERRCODE = '22023';
    END IF;

    v_description := nullif(btrim(coalesce(v_row ->> 'description', '')), '');
    IF v_description IS NOT NULL AND char_length(v_description) > 2000 THEN
      RAISE EXCEPTION 'Row %: keep the description to 2000 characters or fewer.',
        v_line USING ERRCODE = '22023';
    END IF;

    IF nullif(btrim(coalesce(v_row ->> 'costPrice', '')), '') IS NULL THEN
      v_cost := NULL;
    ELSIF btrim(v_row ->> 'costPrice') ~ '^\d{1,10}(\.\d{1,2})?$' THEN
      v_cost := btrim(v_row ->> 'costPrice')::numeric;
    ELSE
      RAISE EXCEPTION 'Row %: enter the cost price as an amount, for example 4.50.',
        v_line USING ERRCODE = '22023';
    END IF;

    IF nullif(btrim(coalesce(v_row ->> 'sellingPrice', '')), '') IS NULL THEN
      v_selling := NULL;
    ELSIF btrim(v_row ->> 'sellingPrice') ~ '^\d{1,10}(\.\d{1,2})?$' THEN
      v_selling := btrim(v_row ->> 'sellingPrice')::numeric;
    ELSE
      RAISE EXCEPTION 'Row %: enter the selling price as an amount, for example 4.50.',
        v_line USING ERRCODE = '22023';
    END IF;

    IF nullif(btrim(coalesce(v_row ->> 'reorderLevel', '')), '') IS NULL THEN
      v_reorder := NULL;
    ELSIF btrim(v_row ->> 'reorderLevel') ~ '^\d{1,9}(\.\d{1,3})?$' THEN
      v_reorder := btrim(v_row ->> 'reorderLevel')::numeric;
    ELSE
      RAISE EXCEPTION 'Row %: enter the reorder level as a number, for example 6 or 2.5.',
        v_line USING ERRCODE = '22023';
    END IF;

    IF nullif(btrim(coalesce(v_row ->> 'targetStockLevel', '')), '') IS NULL THEN
      v_target := NULL;
    ELSIF btrim(v_row ->> 'targetStockLevel') ~ '^\d{1,9}(\.\d{1,3})?$' THEN
      v_target := btrim(v_row ->> 'targetStockLevel')::numeric;
    ELSE
      RAISE EXCEPTION 'Row %: enter the target stock as a number, for example 12.',
        v_line USING ERRCODE = '22023';
    END IF;

    IF nullif(btrim(coalesce(v_row ->> 'opening', '')), '') IS NULL THEN
      v_opening := 0;
    ELSIF btrim(v_row ->> 'opening') ~ '^\d{1,9}(\.\d{1,3})?$' THEN
      v_opening := btrim(v_row ->> 'opening')::numeric;
    ELSE
      RAISE EXCEPTION 'Row %: enter the opening stock as a number, for example 6 or 2.5.',
        v_line USING ERRCODE = '22023';
    END IF;

    IF v_supplier_name IS NOT NULL THEN
      SELECT count(*)::int INTO v_supplier_matches
        FROM suppliers s
       WHERE s.business_id = p_business_id
         AND lower(s.name) = lower(v_supplier_name)
         AND s.is_archived = false;

      IF v_supplier_matches > 1 THEN
        RAISE EXCEPTION 'Row %: two suppliers are called %. Rename one before importing.',
          v_line, v_supplier_name USING ERRCODE = '22023';
      END IF;

      IF v_supplier_matches = 1 THEN
        SELECT s.id INTO v_supplier_id
          FROM suppliers s
         WHERE s.business_id = p_business_id
           AND lower(s.name) = lower(v_supplier_name)
           AND s.is_archived = false
         LIMIT 1;
      ELSIF v_create_suppliers THEN
        INSERT INTO suppliers (business_id, name)
        VALUES (p_business_id, v_supplier_name)
        RETURNING id INTO v_supplier_id;

        IF NOT v_supplier_name = ANY (v_new_suppliers) THEN
          v_new_suppliers := array_append(v_new_suppliers, v_supplier_name);
        END IF;
      ELSE
        RAISE EXCEPTION 'Row %: supplier % does not exist. Tick “Create missing suppliers” or add it first.',
          v_line, v_supplier_name USING ERRCODE = '22023';
      END IF;
    ELSE
      v_supplier_id := v_default_supplier;
    END IF;

    IF v_supplier_id IS NULL THEN
      RAISE EXCEPTION 'Row %: choose a supplier for the file or add a Supplier column.',
        v_line USING ERRCODE = '22023';
    END IF;

    IF v_category_name IS NOT NULL THEN
      SELECT c.id INTO v_category_id
        FROM categories c
       WHERE c.business_id = p_business_id
         AND lower(c.name) = lower(v_category_name);

      IF v_category_id IS NULL THEN
        IF NOT v_create_categories THEN
          RAISE EXCEPTION 'Row %: category % does not exist. Tick “Create missing categories” or add it first.',
            v_line, v_category_name USING ERRCODE = '22023';
        END IF;

        INSERT INTO categories (business_id, name)
        VALUES (p_business_id, v_category_name)
        RETURNING id INTO v_category_id;

        IF NOT v_category_name = ANY (v_new_categories) THEN
          v_new_categories := array_append(v_new_categories, v_category_name);
        END IF;
      END IF;
    ELSE
      v_category_id := NULL;
    END IF;

    SELECT p.id INTO v_existing_id
      FROM products p
     WHERE p.business_id = p_business_id AND p.sku = v_sku;

    IF v_existing_id IS NOT NULL THEN
      IF NOT v_update_existing THEN
        RAISE EXCEPTION 'Row %: SKU % is already in this business. Tick “Update existing products” to refresh it.',
          v_line, v_sku USING ERRCODE = '22023';
      END IF;

      IF v_opening <> 0 THEN
        RAISE EXCEPTION 'Row %: SKU % already exists, so its opening stock cannot be set. Use a stock adjustment instead.',
          v_line, v_sku USING ERRCODE = '22023';
      END IF;

      -- Only the values the file actually carries. A blank cell is null above,
      -- so coalesce keeps the stored column instead of writing the default. The
      -- required columns (name, SKU) are always applied.
      UPDATE products
         SET name = v_name,
             barcode = coalesce(v_barcode, barcode),
             description = coalesce(v_description, description),
             category_id = coalesce(v_category_id, category_id),
             unit_of_measure = coalesce(v_unit, unit_of_measure),
             cost_price = coalesce(v_cost, cost_price),
             selling_price = coalesce(v_selling, selling_price),
             reorder_level = coalesce(v_reorder, reorder_level),
             target_stock_level = coalesce(v_target, target_stock_level),
             updated_at = now()
       WHERE business_id = p_business_id AND id = v_existing_id;

      UPDATE product_suppliers
         SET is_default = false, updated_at = now()
       WHERE business_id = p_business_id
         AND product_id = v_existing_id
         AND supplier_id <> v_supplier_id
         AND is_default;

      INSERT INTO product_suppliers
        (business_id, product_id, supplier_id, supplier_sku, is_default)
      VALUES
        (p_business_id, v_existing_id, v_supplier_id, v_supplier_sku, true)
      ON CONFLICT (business_id, product_id, supplier_id) DO UPDATE
        SET supplier_sku = coalesce(
              excluded.supplier_sku, product_suppliers.supplier_sku
            ),
            is_default = true,
            updated_at = now();

      v_updated := v_updated + 1;
    ELSE
      INSERT INTO products
        (business_id, category_id, name, sku, barcode, description,
         unit_of_measure, cost_price, selling_price, reorder_level,
         target_stock_level)
      VALUES
        (p_business_id, v_category_id, v_name, v_sku, v_barcode, v_description,
         coalesce(v_unit, 'ea'), coalesce(v_cost, 0), v_selling,
         coalesce(v_reorder, 0), v_target)
      RETURNING id INTO v_product_id;

      INSERT INTO product_suppliers
        (business_id, product_id, supplier_id, supplier_sku, is_default)
      VALUES
        (p_business_id, v_product_id, v_supplier_id, v_supplier_sku, true);

      IF v_opening > 0 THEN
        INSERT INTO stock_movements
          (business_id, product_id, movement_type, quantity_delta, reason,
           reference_type, reference_id, created_by)
        VALUES
          (p_business_id, v_product_id, 'opening', v_opening,
           'Opening balance from ' || btrim(p_filename),
           'import', v_import_id, auth.uid());
        v_openings := v_openings + 1;
      END IF;

      v_imported := v_imported + 1;
    END IF;
  END LOOP;

  v_skipped := p_total_rows - v_imported - v_updated;
  IF v_skipped < 0 THEN
    RAISE EXCEPTION 'The import counts do not add up.' USING ERRCODE = '22023';
  END IF;

  UPDATE csv_imports
     SET imported_rows = v_imported,
         updated_rows = v_updated,
         skipped_rows = v_skipped,
         opening_movements = v_openings,
         summary = jsonb_build_object(
           'createdCategories', to_jsonb(v_new_categories),
           'createdSuppliers', to_jsonb(v_new_suppliers)
         )
   WHERE business_id = p_business_id AND id = v_import_id;

  v_summary := format(
    'Imported %s products from %s', v_imported + v_updated, btrim(p_filename)
  );

  INSERT INTO activity_log
    (business_id, actor_user_id, action, entity_type, entity_id, summary, detail)
  VALUES
    (p_business_id, auth.uid(), 'import.completed', 'import', v_import_id,
     left(v_summary, 300),
     jsonb_build_object(
       'import_id', v_import_id,
       'filename', btrim(p_filename),
       'total_rows', p_total_rows,
       'imported', v_imported,
       'updated', v_updated,
       'skipped', v_skipped,
       'opening_movements', v_openings
     ));

  RETURN QUERY SELECT v_import_id, v_imported, v_updated, v_skipped, v_openings;
END;
$$;
