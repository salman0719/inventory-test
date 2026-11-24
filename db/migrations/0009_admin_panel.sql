-- The admin panel's reads.
--
-- Approval and rejection already exist (0008) and are called by the panel as the
-- signed-in admin. What is missing is reading: every question the panel asks crosses
-- tenants, so each one is a narrowly shaped SECURITY DEFINER function that checks
-- private.is_platform_admin() and returns only the columns a screen renders. The
-- alternative — granting an admin role broad SELECT on tenant tables — would make one
-- compromised admin session a full data breach.
--
-- The guard mirrors 0008: the owner role (the SQL editor, a migration) is the manual
-- path and is allowed; any application role must be on platform_admins.

CREATE OR REPLACE FUNCTION "private"."admin_overview"()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pending integer;
  v_new_this_week integer;
  v_businesses integer;
  v_accounts integer;
  v_unconfirmed integer;
  v_decided_this_week integer;
  v_recent jsonb;
BEGIN
  IF coalesce(current_setting('role', true), 'none') = 'authenticated'
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a platform admin can read the admin overview.'
      USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::int INTO v_pending
    FROM signup_requests WHERE status = 'pending';
  SELECT count(*)::int INTO v_new_this_week
    FROM signup_requests WHERE created_at >= now() - interval '7 days';
  SELECT count(*)::int INTO v_businesses FROM businesses;
  SELECT count(*)::int INTO v_accounts FROM auth.users;
  -- A registration that never confirms never reaches the queue: the address is the
  -- only thing the panel can act on, so the count is shown rather than hidden.
  SELECT count(*)::int INTO v_unconfirmed
    FROM auth.users WHERE email_confirmed_at IS NULL;
  SELECT count(*)::int INTO v_decided_this_week
    FROM signup_requests WHERE decided_at >= now() - interval '7 days';

  SELECT coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', r.id,
               'businessName', r.business_name,
               'status', r.status,
               'decidedAt', r.decided_at
             ) ORDER BY r.decided_at DESC
           ),
           '[]'::jsonb
         )
    INTO v_recent
    FROM (
      SELECT s.id, s.business_name, s.status, s.decided_at
        FROM signup_requests s
       WHERE s.decided_at IS NOT NULL
       ORDER BY s.decided_at DESC
       LIMIT 5
    ) r;

  RETURN jsonb_build_object(
    'pending', v_pending,
    'newThisWeek', v_new_this_week,
    'businesses', v_businesses,
    'accounts', v_accounts,
    'unconfirmed', v_unconfirmed,
    'decidedThisWeek', v_decided_this_week,
    'recent', v_recent
  );
END;
$$;
--> statement-breakpoint

COMMENT ON FUNCTION "private"."admin_overview"()
  IS 'Counts for the admin overview; refused unless the caller is a platform admin.';
--> statement-breakpoint

-- One row shape for the queue and the detail panel, so the panel cannot drift from
-- what the list showed.
CREATE OR REPLACE FUNCTION "private"."list_signup_requests"(
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  status text,
  full_name text,
  email text,
  business_name text,
  business_type text,
  created_at timestamp with time zone,
  decided_at timestamp with time zone,
  admin_note text,
  business_id uuid,
  email_confirmed boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
BEGIN
  IF coalesce(current_setting('role', true), 'none') = 'authenticated'
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a platform admin can read registrations.'
      USING ERRCODE = '42501';
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Unknown registration status.' USING ERRCODE = '22023';
  END IF;

  -- Waiting requests first, oldest first: the queue is worked from the top. Decided
  -- rows follow in the order they were filed, which keeps an unfiltered list stable.
  RETURN QUERY
    SELECT s.id, s.status, s.full_name, s.email, s.business_name,
           s.business_type, s.created_at, s.decided_at, s.admin_note,
           s.business_id, (u.email_confirmed_at IS NOT NULL) AS email_confirmed
      FROM signup_requests s
      JOIN auth.users u ON u.id = s.user_id
     WHERE (p_status IS NULL OR s.status = p_status)
       AND (v_search IS NULL
            OR s.full_name ILIKE '%' || v_search || '%'
            OR s.email ILIKE '%' || v_search || '%'
            OR s.business_name ILIKE '%' || v_search || '%')
     ORDER BY (s.status = 'pending') DESC, s.created_at ASC
     LIMIT least(greatest(coalesce(p_limit, 100), 1), 500);
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "private"."get_signup_request"(p_id uuid)
RETURNS TABLE (
  id uuid,
  status text,
  full_name text,
  email text,
  business_name text,
  business_type text,
  created_at timestamp with time zone,
  decided_at timestamp with time zone,
  admin_note text,
  business_id uuid,
  email_confirmed boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF coalesce(current_setting('role', true), 'none') = 'authenticated'
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a platform admin can read registrations.'
      USING ERRCODE = '42501';
  END IF;

  IF p_id IS NULL THEN
    RAISE EXCEPTION 'A registration id is required.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
    SELECT s.id, s.status, s.full_name, s.email, s.business_name,
           s.business_type, s.created_at, s.decided_at, s.admin_note,
           s.business_id, (u.email_confirmed_at IS NOT NULL) AS email_confirmed
      FROM signup_requests s
      JOIN auth.users u ON u.id = s.user_id
     WHERE s.id = p_id;
END;
$$;
--> statement-breakpoint

COMMENT ON FUNCTION "private"."list_signup_requests"(text, text, integer)
  IS 'The registration queue and history, oldest waiting first; admin only.';
--> statement-breakpoint
COMMENT ON FUNCTION "private"."get_signup_request"(uuid)
  IS 'One registration for the detail panel; admin only.';
--> statement-breakpoint

REVOKE ALL ON FUNCTION "private"."admin_overview"() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "private"."list_signup_requests"(text, text, integer) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "private"."get_signup_request"(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "private"."admin_overview"() TO "authenticated";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "private"."list_signup_requests"(text, text, integer) TO "authenticated";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "private"."get_signup_request"(uuid) TO "authenticated";
