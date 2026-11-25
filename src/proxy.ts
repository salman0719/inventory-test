import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { timed } from "./lib/nav-timing";
import {
  encodeVerifiedEmail,
  VERIFIED_USER_EMAIL_HEADER,
  VERIFIED_USER_ID_HEADER,
} from "./lib/verified-session";

/**
 * Session verification and route protection.
 *
 * `supabase.auth.getClaims()` verifies the access token's signature locally against
 * the project's published JWKS (the project signs with ES256), so an ordinary
 * navigation no longer waits on a Supabase Auth round trip before the app can
 * answer. A tampered token fails the signature check; nothing is trusted from the
 * cookie itself.
 *
 * `getUser()` is still the authority on the paths where local verification cannot
 * decide: no session, an expired token, or a token this runtime cannot verify. That
 * call is also what refreshes the session and writes new cookies, which Server
 * Components cannot do — so it stays, at the cost of a round trip on exactly the
 * requests that need one.
 *
 * The verified identity is then forwarded as request headers, because this is where
 * the check happens: the page, the route handlers and the Server Actions read it
 * instead of calling Supabase again (`src/lib/session.ts`). Whichever path produced
 * the identity — local claims or the `getUser()` fallback — the header is set from
 * that result and never from anything the browser sent.
 */
export async function proxy(request: NextRequest) {
  // Cookies refreshed during verification are written to the request so the app
  // reads the new session, and replayed onto the response below so the browser
  // stores it. Collected here rather than written to a response built too early:
  // that response would miss the verified headers, which are only known at the end.
  type PendingCookie = { name: string; value: string; options: CookieOptions };
  let pendingCookies: PendingCookie[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          pendingCookies = cookiesToSet;
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
        },
      },
    },
  );

  // Local verification first. Measured with `NAV_TIMING=1` as `proxy.claims`; if it
  // ever reports a network-sized number instead of a sub-millisecond one, the SDK
  // has fallen back to `getUser()` internally and there is no saving to claim.
  const claims = await timed("proxy.claims", () => supabase.auth.getClaims());
  const subject = claims.data?.claims?.sub;
  const claimedEmail = claims.data?.claims?.email;

  // Anything that is not a locally verified subject — no cookie, an expired token, a
  // failed signature, a runtime without WebCrypto — is decided by Supabase itself.
  // That call is also what refreshes the session and writes the new cookies.
  let user: { id: string; email: string | null } | null = null;
  if (typeof subject === "string" && subject !== "") {
    user = {
      id: subject,
      email: typeof claimedEmail === "string" ? claimedEmail : null,
    };
  } else {
    const fallback = await timed("proxy.auth", () => supabase.auth.getUser());
    user = fallback.data.user
      ? { id: fallback.data.user.id, email: fallback.data.user.email ?? null }
      : null;
  }

  // The handover. `request.headers` is what `NextResponse.next` forwards, so this is
  // the only way the render path sees who was verified. `set` overwrites, so a
  // browser that sends its own `x-verified-*` cannot influence the answer.
  if (user) {
    request.headers.set(VERIFIED_USER_ID_HEADER, user.id);
    // Deleted first, so a header the browser sent does not survive merely because
    // this session happens to have no email claim.
    request.headers.delete(VERIFIED_USER_EMAIL_HEADER);
    if (user.email !== null) {
      request.headers.set(
        VERIFIED_USER_EMAIL_HEADER,
        encodeVerifiedEmail(user.email),
      );
    }
  }

  const { pathname, search } = request.nextUrl;
  const isSignIn = pathname === "/sign-in";
  const isRegister = pathname === "/register";
  // The email link has to be reachable without a session: confirming the address is
  // what creates one. Registration and reset both land here.
  const isConfirm = pathname === "/auth/confirm";
  const isSignedOutPage = isSignIn || isRegister || isConfirm;

  if (!user && !isSignedOutPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  // Already signed in: neither form has anything to do. `/auth/confirm` is left
  // alone, because a recovery link opens while a session exists.
  if (user && (isSignIn || isRegister)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next({ request });
  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options);
  }
  return response;
}

export const config = {
  matcher: [
    // Everything except Next assets, the favicon and static files. The scanner's
    // wasm is fetched by a worker, which cannot carry the session redirect flow.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|wasm)$).*)",
  ],
};
