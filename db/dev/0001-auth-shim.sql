-- Development and CI only. Never applied to a hosted project.
--
-- Hosted Supabase owns the auth schema, auth.users and auth.uid(). Local Postgres
-- has none of them, so RLS policies would reference a missing function. This shim
-- supplies the minimum: the `authenticated` role, an auth.users table for the
-- foreign keys, and an auth.uid() that reads the JWT `sub` claim exactly the way
-- Supabase's does — so the policy SQL is identical in both places.
--
-- Guarded so it is a no-op against a real Supabase database if it is ever run
-- there by accident.

DO $$
DECLARE
  uid_body text := $q$select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid$q$;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;

  IF to_regclass('auth.users') IS NULL THEN
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE auth.users (
      id uuid PRIMARY KEY,
      email text NOT NULL UNIQUE
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth'
      AND p.proname = 'uid'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE format('CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS %L', uid_body);
  END IF;

  -- Hosted Supabase records this on auth.users; the admin overview counts accounts
  -- that registered and never confirmed, which is the biggest silent drop-off.
  ALTER TABLE auth.users
    ADD COLUMN IF NOT EXISTS email_confirmed_at timestamp with time zone;
END
$$;

GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
