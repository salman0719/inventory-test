import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ensureSignupRequest } from "@/lib/signup";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Where an email link lands.
 *
 * Supabase sends two shapes depending on the template and the flow: a PKCE `code`
 * that has to be exchanged for a session, or a `token_hash` plus `type` that
 * `verifyOtp` consumes. Both are accepted, so neither the default templates nor a
 * custom one needs changing for registration to work.
 *
 * The identity used to write the registration row comes from the exchange itself,
 * not from a second `getUser()`: the cookies for a session created in this handler
 * are only guaranteed on the response that follows it.
 */
const OTP_TYPES = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
] as const;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = z.enum(OTP_TYPES).safeParse(params.get("type"));

  const supabase = await createSupabaseServerClient();

  let user: {
    id: string;
    email?: string;
    user_metadata: Record<string, unknown>;
  } | null = null;
  let failed = false;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
    user = data.user;
  } else if (tokenHash && type.success) {
    const { data, error } = await supabase.auth.verifyOtp({
      type: type.data as EmailOtpType,
      token_hash: tokenHash,
    });
    failed = Boolean(error);
    user = data.user;
  } else {
    failed = true;
  }

  if (failed) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    url.searchParams.set("reason", "link-expired");
    return NextResponse.redirect(url);
  }

  if (user) {
    try {
      await ensureSignupRequest(
        user.id,
        user.email ?? "",
        user.user_metadata ?? {},
      );
    } catch (error) {
      // A confirmed account must still reach the app: the awaiting screen can show
      // "no request" and the owner can link the account by hand.
      console.error("auth/confirm: could not record the signup request", error);
    }
  }

  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.search = "";
  return NextResponse.redirect(url);
}
