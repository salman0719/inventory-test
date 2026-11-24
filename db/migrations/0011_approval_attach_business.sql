-- Approval can attach an account to a business that already exists.
--
-- 0008 could only create a business, so a manager joining an existing café, a second
-- owner after a sale, or someone who registered twice ended up as a second "Bean &
-- Gone" with its own empty catalogue. Approval now takes an optional target: with no
-- target it behaves exactly as before (new business, applicant is owner); with a
-- target it creates no business and adds a membership instead.
--
-- Attaching as `owner` is refused on purpose. The queue is a place to let a colleague
-- in, not a place to hand over someone else's books; an ownership change stays an
-- out-of-band operation. `staff` and `viewer` are the roles a reviewer may grant.
--
-- Duplicate detection is a read: `match_businesses` compares names after normalising
-- them (case, punctuation, and a leading or joining "the"/"and"), which is what makes
-- "Bean & Gone", "Bean and Gone" and "bean gone" one candidate instead of three. It
-- suggests; it never decides, and nothing here merges two businesses.

-- Punctuation, case and filler words are how the same shop gets typed twice.
CREATE OR REPLACE FUNCTION "private"."normalise_business_name"(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(
           regexp_replace(
             regexp_replace(
               lower(coalesce(p_name, '')),
               '\m(the|and)\M', '', 'gi'
             ),
             '[^a-z0-9]', '', 'g'
           ),
           ''
         );
$$;
--> statement-breakpoint

COMMENT ON FUNCTION "private"."normalise_business_name"(text)
  IS 'Comparison key for business names: case, punctuation and the words the/and ignored.';
--> statement-breakpoint

-- Businesses that look like the one an applicant asked for, so the reviewer sees the
-- duplicate before approving a second one. `exact` is a normalised equality; the rest
-- are containment matches on a name long enough to mean something.
CREATE OR REPLACE FUNCTION "private"."match_businesses"(
  p_name text,
  p_limit integer DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  name text,
  business_type text,
  created_at timestamp with time zone,
  members integer,
  owner_email text,
  exact boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
           (SELECT u.email
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
$$;
--> statement-breakpoint

COMMENT ON FUNCTION "private"."match_businesses"(text, integer)
  IS 'Existing businesses whose names resemble an applicant''s claim; admin only.';
--> statement-breakpoint

-- One business, for the screen that reports what an approval did.
CREATE OR REPLACE FUNCTION "private"."get_admin_business"(p_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  business_type text,
  created_at timestamp with time zone,
  members integer,
  owner_email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
           (SELECT u.email
              FROM business_members m
              JOIN auth.users u ON u.id = m.user_id
             WHERE m.business_id = b.id AND m.role = 'owner'
             LIMIT 1) AS owner_email
      FROM businesses b
     WHERE b.id = p_id;
END;
$$;
--> statement-breakpoint

COMMENT ON FUNCTION "private"."get_admin_business"(uuid)
  IS 'One business as identity and counts, for the approval result; admin only.';
--> statement-breakpoint

-- The old signature must go, or the three-argument version below would be an overload
-- and a one-argument call would keep hitting the version that always creates a
-- business. Defaults preserve every existing `approve_signup_request('<id>')` call.
DROP FUNCTION IF EXISTS "private"."approve_signup_request"(uuid);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "private"."approve_signup_request"(
  p_request_id uuid,
  p_business_id uuid DEFAULT NULL,
  p_role text DEFAULT 'owner'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request signup_requests%ROWTYPE;
  v_target uuid := p_business_id;
  v_business_id uuid;
  v_business_name text;
  v_role text := lower(btrim(coalesce(p_role, 'owner')));
  v_member_role text;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A registration id is required.' USING ERRCODE = '22023';
  END IF;

  -- The owner role is the manual path from the SQL editor; any application role
  -- must be on the admin list. Same guard as 0008.
  IF coalesce(current_setting('role', true), 'none') = 'authenticated'
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a platform admin can approve a registration.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request
    FROM signup_requests s
   WHERE s.id = p_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That registration does not exist.' USING ERRCODE = 'P0002';
  END IF;

  IF v_request.status = 'rejected' THEN
    RAISE EXCEPTION 'That registration was rejected.' USING ERRCODE = '22023';
  END IF;

  IF v_request.status = 'approved' AND v_request.business_id IS NOT NULL THEN
    SELECT b.name INTO v_business_name
      FROM businesses b
     WHERE b.id = v_request.business_id;
    SELECT m.role INTO v_member_role
      FROM business_members m
     WHERE m.business_id = v_request.business_id AND m.user_id = v_request.user_id;
    RETURN jsonb_build_object(
      'businessId', v_request.business_id,
      'businessName', coalesce(v_business_name, v_request.business_name),
      'alreadyApproved', true,
      'role', coalesce(v_member_role, 'owner')
    );
  END IF;

  IF v_target IS NULL THEN
    -- Unchanged behaviour: one new business, the applicant is its owner.
    IF v_role <> 'owner' THEN
      RAISE EXCEPTION 'A role only applies when attaching to an existing business.'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO businesses (name, business_type)
    VALUES (v_request.business_name, v_request.business_type)
    RETURNING id, name INTO v_business_id, v_business_name;

    INSERT INTO business_members (business_id, user_id, role)
    VALUES (v_business_id, v_request.user_id, 'owner');
    v_member_role := 'owner';
  ELSE
    IF v_role NOT IN ('staff', 'viewer') THEN
      RAISE EXCEPTION 'Ownership is not transferred from the registration queue; attach as staff or viewer.'
        USING ERRCODE = '22023';
    END IF;

    SELECT b.id, b.name INTO v_business_id, v_business_name
      FROM businesses b
     WHERE b.id = v_target;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'That business does not exist.' USING ERRCODE = 'P0002';
    END IF;

    -- Someone already attached keeps the role they have: an existing owner is not
    -- demoted to staff by a second approval, and `on conflict do nothing` makes a
    -- repeated click harmless. The role actually held is returned, not the one asked
    -- for.
    INSERT INTO business_members (business_id, user_id, role)
    VALUES (v_business_id, v_request.user_id, v_role)
    ON CONFLICT (business_id, user_id) DO NOTHING;

    SELECT m.role INTO v_member_role
      FROM business_members m
     WHERE m.business_id = v_business_id AND m.user_id = v_request.user_id;
  END IF;

  UPDATE signup_requests
     SET status = 'approved',
         business_id = v_business_id,
         decided_at = now(),
         decided_by = auth.uid(),
         admin_note = NULL
   WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'businessId', v_business_id,
    'businessName', v_business_name,
    'alreadyApproved', false,
    'role', v_member_role
  );
END;
$$;
--> statement-breakpoint

COMMENT ON FUNCTION "private"."approve_signup_request"(uuid, uuid, text)
  IS 'Approves a registration: a new business with the applicant as owner, or a staff/viewer membership on an existing one.';
--> statement-breakpoint

REVOKE ALL ON FUNCTION "private"."match_businesses"(text, integer) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "private"."get_admin_business"(uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "private"."approve_signup_request"(uuid, uuid, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "private"."match_businesses"(text, integer) TO "authenticated";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "private"."get_admin_business"(uuid) TO "authenticated";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "private"."approve_signup_request"(uuid, uuid, text) TO "authenticated";
