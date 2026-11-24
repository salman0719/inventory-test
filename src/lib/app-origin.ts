/**
 * The origin a confirmation link may return to.
 *
 * The request's own origin wins. On the stage that is the deployment alias, which
 * is what Supabase has allowlisted and what the visitor is actually browsing; in
 * development it is `localhost:25000`. `APP_URL` is only a fallback for a caller
 * with no request headers, and it is refused unless it parses as a bare http(s)
 * origin.
 *
 * This is not cosmetic: when `emailRedirectTo` is not an allowed URL, GoTrue does
 * not fail the sign-up — it replaces the redirect with the Site URL, so the
 * confirmation link lands on `/` with an unused `?code=` and the request row is
 * never written. A stray newline or a missing scheme in `APP_URL` is enough.
 */

const FALLBACK_ORIGIN = "http://localhost:3000";

/**
 * A configured value is usable only as a bare origin: no pathname, query or hash.
 * `https://host:port` and `https://host/` both normalise to `https://host`.
 */
function asOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.pathname !== "/" || url.search || url.hash) return null;
  return url.origin;
}

function isLoopback(host: string): boolean {
  const name = host.split(":")[0]?.toLowerCase() ?? "";
  return name === "localhost" || name === "127.0.0.1" || name === "[::1]";
}

export function resolveAppOrigin(input: {
  forwardedHost?: string | null;
  host?: string | null;
  protocol?: string | null;
  configured?: string | null;
}): string {
  const host = (input.forwardedHost ?? input.host ?? "").trim();
  if (host) {
    // `x-forwarded-proto` is set by the platform; a bare `localhost:25000` is
    // http, and anything else without the header is assumed to be behind TLS.
    const protocol =
      input.protocol === "http" || input.protocol === "https"
        ? input.protocol
        : isLoopback(host)
          ? "http"
          : "https";
    const fromRequest = asOrigin(`${protocol}://${host}`);
    if (fromRequest) return fromRequest;
  }

  return asOrigin(input.configured) ?? FALLBACK_ORIGIN;
}
