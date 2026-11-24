-- A reviewer can confirm an address, and file the registration it carries.
--
-- Until now nothing in the product could move an unconfirmed account forward: with
-- confirmation on, the `signup_requests` row is written only by `/auth/confirm`, so an
-- applicant whose email never arrived could not sign in, could not be approved, and
-- was invisible to the queue. The panel could see the account and say "address not
-- confirmed" — and do nothing about it.
--
-- `private.confirm_account` is that missing step. Confirming sets
-- `auth.users.email_confirmed_at`, which the application role cannot do (no privilege
-- on `auth`, and the project holds no service-role key by design), so it runs as a
-- SECURITY DEFINER function behind the same `is_platform_admin()` guard as the rest of
-- the panel.
--
-- Filing the request in the same transaction is not a convenience: without it the
-- account would sign in and reach nothing, because approval needs a request row. The
-- answers come from the metadata the registration form stored on the user, and are
-- validated here rather than trusted — the browser wrote them, and SQL is the last
-- boundary. An account with no answers (invited, created in the dashboard) is still
-- confirmed, and reports that nothing was filed.
--
-- This deliberately changes what "confirmed" means: it is now "a reviewer vouched for
-- this address", not "the inbox was proved". `docs/decisions/0014-admin-confirmation.md`
-- records that trade. The email link remains the normal path; this is the manual one.

CREATE OR REPLACE FUNCTION "private"."confirm_account"(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user record;
  v_already_confirmed boolean;
  v_email text;
  v_full_name text;
  v_business_name text;
  v_business_type text;
  v_status text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'An account id is required.' USING ERRCODE = '22023';
  END IF;

  IF coalesce(current_setting('role', true), 'none') = 'authenticated'
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a platform admin can confirm an account.'
      USING ERRCODE = '42501';
  END IF;

  SELECT u.id, u.email, u.email_confirmed_at, u.raw_user_meta_data
    INTO v_user
    FROM auth.users u
   WHERE u.id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That account does not exist.' USING ERRCODE = 'P0002';
  END IF;

  v_already_confirmed := v_user.email_confirmed_at IS NOT NULL;
  v_email := nullif(btrim(coalesce(v_user.email, '')), '');

  -- The three answers the registration form writes. Anything else in the metadata is
  -- not ours to interpret.
  v_full_name := nullif(btrim(coalesce(v_user.raw_user_meta_data ->> 'full_name', '')), '');
  v_business_name := nullif(btrim(coalesce(v_user.raw_user_meta_data ->> 'business_name', '')), '');
  v_business_type := nullif(btrim(coalesce(v_user.raw_user_meta_data ->> 'business_type', '')), '');

  -- Answers that are present but unusable are a refusal, not a silent skip: the
  -- reviewer would otherwise confirm an account and wonder why the queue stayed empty.
  IF v_business_type IS NOT NULL AND v_business_type NOT IN ('cafe', 'retail', 'other') THEN
    RAISE EXCEPTION 'The registration answers on that account are not valid.'
      USING ERRCODE = '22023';
  END IF;

  IF (v_full_name IS NOT NULL AND char_length(v_full_name) > 80)
     OR (v_business_name IS NOT NULL AND char_length(v_business_name) > 80) THEN
    RAISE EXCEPTION 'The registration answers on that account are not valid.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT v_already_confirmed THEN
    UPDATE auth.users
       SET email_confirmed_at = now()
     WHERE id = p_user_id;
  END IF;

  -- Only a complete set of answers is a registration; a partial one would fail the
  -- NOT NULL columns or invent a business name.
  IF v_email IS NOT NULL
     AND v_full_name IS NOT NULL
     AND v_business_name IS NOT NULL
     AND v_business_type IS NOT NULL THEN
    INSERT INTO signup_requests
      (user_id, email, full_name, business_name, business_type)
    VALUES
      (p_user_id, lower(v_email), v_full_name, v_business_name, v_business_type)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  SELECT s.status INTO v_status
    FROM signup_requests s
   WHERE s.user_id = p_user_id;

  RETURN jsonb_build_object(
    'userId', p_user_id,
    'email', v_user.email,
    'alreadyConfirmed', v_already_confirmed,
    'requestFiled', v_status IS NOT NULL,
    'registrationStatus', v_status
  );
END;
$$;
--> statement-breakpoint

COMMENT ON FUNCTION "private"."confirm_account"(uuid)
  IS 'Vouches for an address and files its registration from the sign-up metadata; admin only.';
--> statement-breakpoint

REVOKE ALL ON FUNCTION "private"."confirm_account"(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "private"."confirm_account"(uuid) TO "authenticated";
