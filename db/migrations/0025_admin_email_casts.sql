-- Hosted fix: the admin panel read auth.users.email into text columns.
--
-- On compose and CI, auth.users is the development shim and its email column is
-- text. On Supabase it is character varying(255), and PL/pgSQL's RETURN QUERY does
-- not apply an assignment cast, so every function that returned it raised
-- "structure of query does not match function result type". The Settings panel's
-- demo counts and the admin overview never read it, which is why only some screens
-- failed. 0016 already casts in activity_feed for the same reason.
--
-- This re-creates the four affected functions from 0010/0011 with `u.email::text`
-- and changes nothing else. Signatures are unchanged, so their grants survive.

CREATE OR REPLACE FUNCTION private.get_admin_business(p_id uuid)
 RETURNS TABLE(id uuid, name text, business_type text, created_at timestamp with time zone, members integer, owner_email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF coalesce(current_setting('role', true), 'none') = 'authenticated'
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a platform admin can read businesses.'
      USING ERRCODE = '42501';
  END IF;

  IF p_id IS NULL THEN
    RAISE EXCEPTION 'A business id is required.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
    SELECT b.id, b.name, b.business_type, b.created_at,
           (SELECT count(*)::int FROM business_members m
             WHERE m.business_id = b.id) AS members,
           (SELECT u.email::text
              FROM business_members m
              JOIN auth.users u ON u.id = m.user_id
             WHERE m.business_id = b.id AND m.role = 'owner'
             LIMIT 1) AS owner_email
      FROM businesses b
     WHERE b.id = p_id;
END;
$function$

--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.list_accounts(p_search text DEFAULT NULL::text)
 RETURNS TABLE(user_id uuid, email text, email_confirmed boolean, created_at timestamp with time zone, business_id uuid, business_name text, role text, registration_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
BEGIN
  IF coalesce(current_setting('role', true), 'none') = 'authenticated'
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a platform admin can read accounts.'
      USING ERRCODE = '42501';
  END IF;

  -- One row per membership, so an account with two businesses appears twice with its
  -- role in each; an account with no business appears once with nulls.
  RETURN QUERY
    SELECT u.id, u.email::text, (u.email_confirmed_at IS NOT NULL) AS email_confirmed,
           u.created_at, b.id, b.name, m.role::text, s.status
      FROM auth.users u
      LEFT JOIN business_members m ON m.user_id = u.id
      LEFT JOIN businesses b ON b.id = m.business_id
      LEFT JOIN signup_requests s ON s.user_id = u.id
     WHERE (v_search IS NULL
            OR u.email::text ILIKE '%' || v_search || '%'
            OR b.name ILIKE '%' || v_search || '%')
     ORDER BY u.created_at DESC
     LIMIT 500;
END;
$function$

--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.list_businesses(p_search text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, name text, business_type text, created_at timestamp with time zone, products integer, open_orders integer, members integer, owner_email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
BEGIN
  IF coalesce(current_setting('role', true), 'none') = 'authenticated'
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a platform admin can read businesses.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT b.id, b.name, b.business_type, b.created_at,
           (SELECT count(*)::int FROM products p
             WHERE p.business_id = b.id AND p.is_archived = false) AS products,
           (SELECT count(*)::int FROM purchase_orders po
             WHERE po.business_id = b.id
               AND po.status IN ('ordered', 'partially_received')) AS open_orders,
           (SELECT count(*)::int FROM business_members m
             WHERE m.business_id = b.id) AS members,
           (SELECT u.email::text
              FROM business_members m
              JOIN auth.users u ON u.id = m.user_id
             WHERE m.business_id = b.id AND m.role = 'owner'
             LIMIT 1) AS owner_email
      FROM businesses b
     WHERE (v_search IS NULL OR b.name ILIKE '%' || v_search || '%')
     ORDER BY b.created_at DESC
     LIMIT 500;
END;
$function$

--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.match_businesses(p_name text, p_limit integer DEFAULT 5)
 RETURNS TABLE(id uuid, name text, business_type text, created_at timestamp with time zone, members integer, owner_email text, exact boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_key text := private.normalise_business_name(p_name);
BEGIN
  IF coalesce(current_setting('role', true), 'none') = 'authenticated'
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a platform admin can read businesses.'
      USING ERRCODE = '42501';
  END IF;

  -- A name of only punctuation or filler words matches nothing; without this the
  -- predicates below would compare '' against every row.
  IF v_key IS NULL OR length(v_key) < 3 THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT cand.id, cand.name, cand.business_type, cand.created_at,
           (SELECT count(*)::int FROM business_members m
             WHERE m.business_id = cand.id) AS members,
           (SELECT u.email::text
              FROM business_members m
              JOIN auth.users u ON u.id = m.user_id
             WHERE m.business_id = cand.id AND m.role = 'owner'
             LIMIT 1) AS owner_email,
           (cand.norm = v_key) AS exact
      FROM (SELECT b.*, private.normalise_business_name(b.name) AS norm
              FROM businesses b) AS cand
     WHERE cand.norm = v_key
        OR (length(cand.norm) >= 4
            AND (cand.norm LIKE v_key || '%' OR v_key LIKE cand.norm || '%'))
     ORDER BY (cand.norm = v_key) DESC, length(cand.norm), cand.created_at
     LIMIT least(greatest(coalesce(p_limit, 5), 1), 20);
END;
$function$
