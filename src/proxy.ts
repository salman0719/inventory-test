import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { timed } from "./lib/nav-timing";

/**
 * Session refresh and route protection.
 *
 * `supabase.auth.getClaims()` verifies the access token's signature locally against
 * the project's published JWKS (the project signs with ES256), so an ordinary
 * navigation no longer waits on a Supabase Auth round trip before the app can
 * answer. A tampered token fails the signature check; nothing is trusted from the
 * cookie itself.
 *
 * `getUser()` is still the authority on the paths where local verification cannot
 * decide: no session, an expired token, or a token this runtime cannot verify. That
 * call is also what refreshes the session and writes the new cookies, which Server
 * Components cannot do — so it stays, at the cost of a round trip on exactly the
 * requests that need one.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
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

  // Anything that is not a locally verified subject — no cookie, an expired token, a
  // failed signature, a runtime without WebCrypto — is decided by Supabase itself.
  // That call is also what refreshes the session and writes the new cookies.
  const user =
    typeof subject === "string" && subject !== ""
      ? { id: subject }
      : (await timed("proxy.auth", () => supabase.auth.getUser())).data.user;

  const { pathname, search } = request.nextUrl;
  const isSignIn = pathname === "/sign-in";

  if (!user && !isSignIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  if (user && isSignIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except Next assets, the favicon and static files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)",
  ],
};
