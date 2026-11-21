-- RLS policies reference private.is_member / private.has_role as stored OIDs, so
-- they work without schema USAGE (verified locally). Any explicit call from
-- application SQL, a future function or a view definition needs USAGE, though,
-- and on hosted Supabase `authenticated` has none by default. Grant it now so the
-- first such call does not fail in production only.

GRANT USAGE ON SCHEMA "private" TO "authenticated";
