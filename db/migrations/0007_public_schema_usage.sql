-- PostgreSQL 17 leaves a recreated schema owned by the creating role with an
-- owner-only ACL, so wiping and restoring a local database strips `authenticated`
-- of USAGE on `public`. Every query that runs SET LOCAL ROLE authenticated then
-- fails with 42P01 "relation does not exist" — the app as well as `npm run
-- test:db` — until the grant is restored by hand. Supabase grants it itself, so
-- this is a no-op there; it keeps a replayed migration history self-sufficient
-- in both places.

GRANT USAGE ON SCHEMA "public" TO "authenticated";
