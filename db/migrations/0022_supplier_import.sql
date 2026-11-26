-- Slice H2: supplier CSV import.
--
-- The product import (`0021`) already creates a supplier when a product row needs
-- one, but only with a name. This adds the standalone supplier run the prototype
-- showed: name, contact, email, phone, address, lead time and notes, matched by
-- name, with an explicit "update existing" choice.
--
-- Supplier names are how product import resolves its supplier, so this function is
-- careful with them: a name already in the business is refused unless updating was
-- chosen, a name repeated inside the file is refused naming the earlier line, and
-- an archived supplier is refused rather than silently resurrected.
--
-- Updating never clears a value the file does not carry: each optional field is
-- `coalesce(new, existing)`, so a supplier list with only names cannot erase the
-- phone numbers someone typed. The name itself never changes.

CREATE OR REPLACE FUNCTION "private"."import_suppliers"(
  p_business_id uuid,
  p_rows jsonb,
  p_update_existing boolean,
  p_idempotency_key uuid,
  p_filename text,
  p_total_rows int
) RETURNS TABLE (
  import_id uuid,
  imported int,
  updated int,
  skipped int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row jsonb;
  v_row_count int;
  v_import_id uuid;
  v_imported int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  -- Kept apart from the counters: SELECT INTO with no row nulls its targets.
  v_replay_id uuid;
  v_replay_imported int;
  v_replay_updated int;
  v_replay_skipped int;
  v_line int;
  v_name text;
  v_contact text;
  v_email text;
  v_phone text;
  v_address text;
  v_notes text;
  v_lead int;
  v_match_count int;
  v_existing_id uuid;
  v_seen_names text[] := '{}';
  v_summary text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to import suppliers.' USING ERRCODE = '42501';
  END IF;

  IF p_business_id IS NULL OR NOT private.is_member(p_business_id) THEN
    RAISE EXCEPTION 'That business is not yours.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT private.has_role(p_business_id, ARRAY['owner', 'staff']) THEN
    RAISE EXCEPTION 'You do not have permission to import suppliers in this business.'
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

  -- A replay returns the first result and writes nothing, before any duplicate
  -- check, so resubmitting the same file is not an error.
  SELECT ci.id, ci.imported_rows, ci.updated_rows, ci.skipped_rows
    INTO v_replay_id, v_replay_imported, v_replay_updated, v_replay_skipped
    FROM csv_imports ci
   WHERE ci.business_id = p_business_id
     AND ci.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN QUERY SELECT v_replay_id, v_replay_imported, v_replay_updated,
                        v_replay_skipped;
    RETURN;
  END IF;

  INSERT INTO csv_imports
    (business_id, kind, filename, idempotency_key, total_rows, created_by)
  VALUES
    (p_business_id, 'suppliers', btrim(p_filename), p_idempotency_key,
     p_total_rows, auth.uid())
  RETURNING id INTO v_import_id;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF jsonb_typeof(v_row) <> 'object' THEN
      RAISE EXCEPTION 'An imported row is not valid.' USING ERRCODE = '22023';
    END IF;

    v_line := coalesce(nullif(v_row ->> 'rowNumber', '')::int, 0);

    v_name := regexp_replace(btrim(coalesce(v_row ->> 'name', '')), '\s+', ' ', 'g');
    IF v_name = '' OR char_length(v_name) > 120 THEN
      RAISE EXCEPTION 'Row %: enter a supplier name of 120 characters or fewer.',
        v_line USING ERRCODE = '22023';
    END IF;

    IF lower(v_name) = ANY (v_seen_names) THEN
      RAISE EXCEPTION 'Row %: supplier % appears more than once in this file.',
        v_line, v_name USING ERRCODE = '22023';
    END IF;
    v_seen_names := v_seen_names || lower(v_name);

    v_contact := nullif(btrim(coalesce(v_row ->> 'contactName', '')), '');
    IF v_contact IS NOT NULL AND char_length(v_contact) > 80 THEN
      RAISE EXCEPTION 'Row %: keep the contact name to 80 characters or fewer.',
        v_line USING ERRCODE = '22023';
    END IF;

    v_email := nullif(btrim(coalesce(v_row ->> 'email', '')), '');
    IF v_email IS NOT NULL AND char_length(v_email) > 120 THEN
      RAISE EXCEPTION 'Row %: keep the email to 120 characters or fewer.',
        v_line USING ERRCODE = '22023';
    END IF;
    IF v_email IS NOT NULL AND v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      RAISE EXCEPTION 'Row %: % is not an email address.', v_line, v_email
        USING ERRCODE = '22023';
    END IF;

    v_phone := nullif(btrim(coalesce(v_row ->> 'phone', '')), '');
    IF v_phone IS NOT NULL AND char_length(v_phone) > 40 THEN
      RAISE EXCEPTION 'Row %: keep the phone to 40 characters or fewer.',
        v_line USING ERRCODE = '22023';
    END IF;

    v_address := nullif(btrim(coalesce(v_row ->> 'address', '')), '');
    IF v_address IS NOT NULL AND char_length(v_address) > 200 THEN
      RAISE EXCEPTION 'Row %: keep the address to 200 characters or fewer.',
        v_line USING ERRCODE = '22023';
    END IF;

    v_notes := nullif(btrim(coalesce(v_row ->> 'notes', '')), '');
    IF v_notes IS NOT NULL AND char_length(v_notes) > 2000 THEN
      RAISE EXCEPTION 'Row %: keep the notes to 2000 characters or fewer.',
        v_line USING ERRCODE = '22023';
    END IF;

    IF nullif(btrim(coalesce(v_row ->> 'leadTimeDays', '')), '') IS NULL THEN
      v_lead := NULL;
    ELSIF btrim(v_row ->> 'leadTimeDays') ~ '^\d{1,3}$'
          AND (btrim(v_row ->> 'leadTimeDays'))::int <= 365 THEN
      v_lead := (btrim(v_row ->> 'leadTimeDays'))::int;
    ELSE
      RAISE EXCEPTION 'Row %: enter the lead time as a whole number of days from 0 to 365.',
        v_line USING ERRCODE = '22023';
    END IF;

    SELECT count(*)::int INTO v_match_count
      FROM suppliers s
     WHERE s.business_id = p_business_id
       AND lower(s.name) = lower(v_name)
       AND s.is_archived = false;

    IF v_match_count > 1 THEN
      RAISE EXCEPTION 'Row %: two suppliers are called %. Rename one before importing.',
        v_line, v_name USING ERRCODE = '22023';
    END IF;

    IF v_match_count = 1 THEN
      SELECT s.id INTO v_existing_id
        FROM suppliers s
       WHERE s.business_id = p_business_id
         AND lower(s.name) = lower(v_name)
         AND s.is_archived = false
       LIMIT 1;

      IF NOT coalesce(p_update_existing, false) THEN
        RAISE EXCEPTION 'Row %: % is already a supplier. Tick “Update existing suppliers”, or remove the row.',
          v_line, v_name USING ERRCODE = '22023';
      END IF;

      UPDATE suppliers
         SET contact_name = coalesce(v_contact, contact_name),
             email = coalesce(v_email, email),
             phone = coalesce(v_phone, phone),
             address = coalesce(v_address, address),
             notes = coalesce(v_notes, notes),
             lead_time_days = coalesce(v_lead, lead_time_days),
             updated_at = now()
       WHERE business_id = p_business_id AND id = v_existing_id;

      v_updated := v_updated + 1;
    ELSE
      IF EXISTS (
        SELECT 1 FROM suppliers s
         WHERE s.business_id = p_business_id
           AND lower(s.name) = lower(v_name)
           AND s.is_archived = true
      ) THEN
        RAISE EXCEPTION 'Row %: % is archived in this business. Restore it before importing.',
          v_line, v_name USING ERRCODE = '22023';
      END IF;

      INSERT INTO suppliers
        (business_id, name, contact_name, email, phone, address, notes,
         lead_time_days)
      VALUES
        (p_business_id, v_name, v_contact, v_email, v_phone, v_address, v_notes,
         v_lead);

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
         skipped_rows = v_skipped
   WHERE business_id = p_business_id AND id = v_import_id;

  v_summary := format(
    'Imported %s suppliers from %s', v_imported + v_updated, btrim(p_filename)
  );

  INSERT INTO activity_log
    (business_id, actor_user_id, action, entity_type, entity_id, summary, detail)
  VALUES
    (p_business_id, auth.uid(), 'import.completed', 'import', v_import_id,
     left(v_summary, 300),
     jsonb_build_object(
       'import_id', v_import_id,
       'kind', 'suppliers',
       'filename', btrim(p_filename),
       'total_rows', p_total_rows,
       'imported', v_imported,
       'updated', v_updated,
       'skipped', v_skipped
     ));

  RETURN QUERY SELECT v_import_id, v_imported, v_updated, v_skipped;
END;
$$;--> statement-breakpoint

COMMENT ON FUNCTION "private"."import_suppliers"(uuid, jsonb, boolean, uuid, text, int)
  IS 'Validates supplier CSV rows, creates or fills in suppliers and records history in one transaction.';--> statement-breakpoint

REVOKE ALL ON FUNCTION "private"."import_suppliers"(uuid, jsonb, boolean, uuid, text, int) FROM PUBLIC;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION "private"."import_suppliers"(uuid, jsonb, boolean, uuid, text, int) TO "authenticated";
