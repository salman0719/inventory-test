-- Registration with manual approval.
--
-- A self-service registration creates an auth user and a request, never a business.
-- Approval is the only path that creates a business and its first owner, and it runs
-- here as one transaction so a half-approved account cannot exist.
--
-- There is no service-role key in this project, so the admin panel will call these
-- functions as the signed-in admin (`SET LOCAL ROLE authenticated`), not as an owner.
-- Until the panel exists, the same functions are the manual approval path: run them
-- from the Supabase SQL editor, where the table owner has no `auth.uid()` and is
-- therefore allowed.
--
-- The two tables are platform-level on purpose. They have no `business_id` because
-- they exist to decide whether a business should exist at all.

CREATE TABLE "platform_admins" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signup_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"business_name" text NOT NULL,
	"business_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"business_id" uuid,
	"admin_note" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signup_requests_status_check" CHECK ("signup_requests"."status" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "signup_requests_business_type_check" CHECK ("signup_requests"."business_type" in ('cafe', 'retail', 'other'))
);
--> statement-breakpoint
ALTER TABLE "signup_requests" ADD CONSTRAINT "signup_requests_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "signup_requests_user_key" ON "signup_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "signup_requests_status_created_idx" ON "signup_requests" USING btree ("status","created_at");--> statement-breakpoint

-- References into auth.users, added here rather than in the Drizzle schema so
-- Drizzle never tries to own the auth schema (same rule as business_members).
ALTER TABLE "platform_admins"
  ADD CONSTRAINT "platform_admins_user_fk"
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "signup_requests"
  ADD CONSTRAINT "signup_requests_user_fk"
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "signup_requests"
  ADD CONSTRAINT "signup_requests_decided_by_fk"
  FOREIGN KEY ("decided_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;--> statement-breakpoint

-- Admin check. SECURITY DEFINER and owned by the migration role, so the lookup
-- bypasses RLS instead of recursing through the platform_admins policy.
CREATE OR REPLACE FUNCTION "private"."is_platform_admin"() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_admins a WHERE a.user_id = auth.uid()
  );
$$;--> statement-breakpoint
COMMENT ON FUNCTION "private"."is_platform_admin"()
  IS 'RLS helper: true when auth.uid() may review registrations.';--> statement-breakpoint

ALTER TABLE "platform_admins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "signup_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- An applicant may read their own request and file one; nothing else. The insert
-- check pins status and the decision columns, so a crafted POST cannot approve
-- itself. Leaving the queue is admin-only, and the functions below do the work.
CREATE POLICY "platform_admins_select" ON "platform_admins" FOR SELECT TO "authenticated"
  USING (private.is_platform_admin());--> statement-breakpoint
CREATE POLICY "signup_requests_select" ON "signup_requests" FOR SELECT TO "authenticated"
  USING ("user_id" = auth.uid() OR private.is_platform_admin());--> statement-breakpoint
CREATE POLICY "signup_requests_insert" ON "signup_requests" FOR INSERT TO "authenticated"
  WITH CHECK (
    "user_id" = auth.uid()
    AND "status" = 'pending'
    AND "business_id" IS NULL
    AND "decided_by" IS NULL
    AND "decided_at" IS NULL
  );--> statement-breakpoint
CREATE POLICY "signup_requests_update" ON "signup_requests" FOR UPDATE TO "authenticated"
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());--> statement-breakpoint

GRANT SELECT ON "platform_admins" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "signup_requests" TO "authenticated";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "private"."is_platform_admin"() TO "authenticated";--> statement-breakpoint

-- Approval. Creates the business and makes the applicant its owner. Repeating it
-- returns the business it already created instead of making a second one.
CREATE OR REPLACE FUNCTION "private"."approve_signup_request"(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request signup_requests%ROWTYPE;
  v_business_id uuid;
  v_business_name text;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A registration id is required.' USING ERRCODE = '22023';
  END IF;

  -- The owner role is the manual path from the SQL editor; any application role
  -- must be on the admin list, including one that reached the function without a
  -- session claim. `role` is the GUC that `SET LOCAL ROLE` sets, which SECURITY
  -- DEFINER does not change (unlike `current_user`).
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
    RETURN jsonb_build_object(
      'businessId', v_request.business_id,
      'businessName', coalesce(v_business_name, v_request.business_name),
      'alreadyApproved', true
    );
  END IF;

  INSERT INTO businesses (name, business_type)
  VALUES (v_request.business_name, v_request.business_type)
  RETURNING id INTO v_business_id;

  INSERT INTO business_members (business_id, user_id, role)
  VALUES (v_business_id, v_request.user_id, 'owner');

  UPDATE signup_requests
     SET status = 'approved',
         business_id = v_business_id,
         decided_at = now(),
         decided_by = auth.uid(),
         admin_note = NULL
   WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'businessId', v_business_id,
    'businessName', v_request.business_name,
    'alreadyApproved', false
  );
END;
$$;--> statement-breakpoint

-- Rejection. Leaves the auth user alone: they can still sign in and read the note on
-- the awaiting screen, and no business or membership is created.
CREATE OR REPLACE FUNCTION "private"."reject_signup_request"(
  p_request_id uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A registration id is required.' USING ERRCODE = '22023';
  END IF;

  IF coalesce(current_setting('role', true), 'none') = 'authenticated'
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a platform admin can reject a registration.'
      USING ERRCODE = '42501';
  END IF;

  SELECT s.status INTO v_status
    FROM signup_requests s
   WHERE s.id = p_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That registration does not exist.' USING ERRCODE = 'P0002';
  END IF;

  IF v_status = 'approved' THEN
    RAISE EXCEPTION 'That registration is already approved.' USING ERRCODE = '22023';
  END IF;

  UPDATE signup_requests
     SET status = 'rejected',
         admin_note = nullif(btrim(coalesce(p_note, '')), ''),
         decided_at = now(),
         decided_by = auth.uid()
   WHERE id = p_request_id;

  RETURN jsonb_build_object('status', 'rejected');
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION "private"."approve_signup_request"(uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "private"."reject_signup_request"(uuid, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "private"."approve_signup_request"(uuid) TO "authenticated";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "private"."reject_signup_request"(uuid, text) TO "authenticated";--> statement-breakpoint

COMMENT ON TABLE "signup_requests"
  IS 'A self-service registration awaiting a platform admin decision; approval creates the business.';--> statement-breakpoint
COMMENT ON TABLE "platform_admins"
  IS 'Platform-wide reviewers. Not a tenant role: no business_id, no membership.';
