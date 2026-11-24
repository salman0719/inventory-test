-- Phase 3 of the admin panel: read-only accounts and businesses.
--
-- Both functions cross tenants by definition, so they are SECURITY DEFINER with the
-- same guard as 0008/0009 and return only the columns the screens render. A business
-- is deliberately reduced to counts: products, open orders and members. Nothing here
-- can read a tenant's catalogue, prices or ledger, which is the line the plan draws —
-- an admin session must not become a way into a customer's data.
--
-- Read-only: there is no update, insert or delete in this migration.

CREATE OR REPLACE FUNCTION "private"."list_accounts"(p_search text DEFAULT NULL)
RETURNS TABLE (
  user_id uuid,
  email text,
  email_confirmed boolean,
  created_at timestamp with time zone,
  business_id uuid,
  business_name text,
  role text,
  registration_status text
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
    RAISE EXCEPTION 'Only a platform admin can read accounts.'
      USING ERRCODE = '42501';
  END IF;

  -- One row per membership, so an account with two businesses appears twice with its
  -- role in each; an account with no business appears once with nulls.
  RETURN QUERY
    SELECT u.id, u.email, (u.email_confirmed_at IS NOT NULL) AS email_confirmed,
           u.created_at, b.id, b.name, m.role::text, s.status
      FROM auth.users u
      LEFT JOIN business_members m ON m.user_id = u.id
      LEFT JOIN businesses b ON b.id = m.business_id
      LEFT JOIN signup_requests s ON s.user_id = u.id
     WHERE (v_search IS NULL
            OR u.email ILIKE '%' || v_search || '%'
            OR b.name ILIKE '%' || v_search || '%')
     ORDER BY u.created_at DESC
     LIMIT 500;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "private"."list_businesses"(p_search text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  name text,
  business_type text,
  created_at timestamp with time zone,
  products integer,
  open_orders integer,
  members integer,
  owner_email text
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
           (SELECT u.email
              FROM business_members m
              JOIN auth.users u ON u.id = m.user_id
             WHERE m.business_id = b.id AND m.role = 'owner'
             LIMIT 1) AS owner_email
      FROM businesses b
     WHERE (v_search IS NULL OR b.name ILIKE '%' || v_search || '%')
     ORDER BY b.created_at DESC
     LIMIT 500;
END;
$$;
--> statement-breakpoint

COMMENT ON FUNCTION "private"."list_accounts"(text)
  IS 'Every account with its business and role; counts and identity only, admin only.';
--> statement-breakpoint
COMMENT ON FUNCTION "private"."list_businesses"(text)
  IS 'Every business as counts (products, open orders, members) and its owner; admin only.';
--> statement-breakpoint

REVOKE ALL ON FUNCTION "private"."list_accounts"(text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "private"."list_businesses"(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "private"."list_accounts"(text) TO "authenticated";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "private"."list_businesses"(text) TO "authenticated";
