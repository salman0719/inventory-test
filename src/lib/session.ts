import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./supabase/server";

/**
 * The signed-in user for this request, verified by Supabase. Cached so the shell,
 * the page and the selector share one verification call.
 *
 * Returning `null` means no valid session; the middleware redirects before a
 * protected route renders, so this is a defence in depth.
 */
export const getSessionUser = cache(async (): Promise<User | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
});
