import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { timed } from "./lib/nav-timing";

/**
 * Session refresh and route protection.
 *
 * `supabase.auth.getUser()` is the authority on whether a session is valid: it
 * calls Supabase, so a tampered cookie cannot pass. Refreshing here keeps the
 * access token current for Server Components, which cannot write cookies.
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

  // Cost of this line: a network round trip to Supabase on every matched request,
  // prefetches included, before the app can send a byte — a large share of the
  // perceived wait when navigating on a slow connection. `getSessionUser()` then
  // repeats the same call inside the page.
  //
  // Open item: verify claims locally with `getClaims()` instead. That needs the
  // Supabase project to sign JWTs asymmetrically and publish a JWKS (or it falls
  // back to the same network call); unconfirmed, so not attempted. Recorded in
  // docs/known-limitations.md under "Navigation latency".
  // Measured with `NAV_TIMING=1`; see src/lib/nav-timing.ts. The comment below is
  // the reason the measurement exists, not a change of behaviour.
  const {
    data: { user },
  } = await timed("proxy.auth", () => supabase.auth.getUser());

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
