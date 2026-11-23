import { cache } from "react";
import { headers } from "next/headers";
import { sessionFromHeaders, type VerifiedSession } from "./verified-session";

/**
 * The signed-in user for this request, as the proxy already verified it.
 *
 * `src/proxy.ts` checks the access token once — locally against the published JWKS
 * or, when that cannot decide, with `getUser()` — and forwards the result as request
 * headers (see `./verified-session`). Reading those headers is the render path's
 * whole auth cost, so a navigation pays for one auth check instead of two.
 *
 * Cached so the shell, the page and any Server Action sharing this render collapse to
 * one read. `null` means no verified session: the proxy redirects a signed-out
 * browser before a protected route renders, so this is the fail-closed answer for a
 * request that arrived without the proxy's headers.
 */
export const getSessionUser = cache(async (): Promise<VerifiedSession | null> =>
  sessionFromHeaders(await headers()),
);
