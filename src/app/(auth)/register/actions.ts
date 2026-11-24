"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAppOrigin } from "@/lib/app-origin";
import {
  ensureSignupRequest,
  registerErrorMessage,
  registerSchema,
} from "@/lib/signup";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type RegisterState = {
  error?: string;
  /** Set when the account was created and the confirmation email was sent. */
  sentTo?: string;
};

/**
 * Where the confirmation link may return to. The request's own origin is what the
 * visitor is on and what Supabase has allowlisted; `APP_URL` is only a fallback for
 * a caller without request headers, and it is validated because a malformed value
 * makes GoTrue substitute the Site URL instead of failing loudly.
 */
async function appOrigin(): Promise<string> {
  const store = await headers();
  return resolveAppOrigin({
    forwardedHost: store.get("x-forwarded-host"),
    host: store.get("host"),
    protocol: store.get("x-forwarded-proto"),
    configured: process.env.APP_URL,
  });
}

export async function register(
  _previous: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const parsed = registerSchema.safeParse({
    fullName: formData.get("fullName"),
    businessName: formData.get("businessName"),
    businessType: formData.get("businessType"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }

  const email = parsed.data.email.trim().toLowerCase();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${await appOrigin()}/auth/confirm`,
      data: {
        full_name: parsed.data.fullName,
        business_name: parsed.data.businessName,
        business_type: parsed.data.businessType,
      },
    },
  });

  if (error) {
    return { error: registerErrorMessage(error.code, error.message) };
  }

  // Supabase answers an existing address with a user that has no identities, so
  // that the form cannot be used to discover who already has an account. Answer
  // the same way it would for a new address.
  if (data.user && data.user.identities?.length === 0) {
    return { sentTo: email };
  }

  // Confirmation is on by default, so there is no session yet and no request row
  // can be written as this user until they click the link. When confirmation is
  // off there is a session, and the row is written now.
  if (data.session && data.user) {
    await ensureSignupRequest(data.user.id, email, data.user.user_metadata);
    redirect("/awaiting-approval");
  }

  return { sentTo: email };
}
