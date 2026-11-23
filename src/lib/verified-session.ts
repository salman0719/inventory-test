import { z } from "zod";

/**
 * The handover from the proxy to the render path.
 *
 * `src/proxy.ts` is the one place that checks the session: locally against the
 * project's published JWKS, or with `getUser()` when local verification cannot
 * decide. It forwards the result as request headers, so a page, route handler or
 * Server Action does not verify the same token a second time — a navigation then
 * pays for one auth check, not two.
 *
 * These headers are trustworthy only because the proxy overwrites them on every
 * request it handles; it never copies a value the browser sent. A request that
 * reaches the app without them is therefore not a signed-in request, and the parse
 * below fails closed rather than guessing.
 */

export const VERIFIED_USER_ID_HEADER = "x-verified-user-id";
export const VERIFIED_USER_EMAIL_HEADER = "x-verified-user-email";

export const verifiedSessionSchema = z.object({
  id: z.uuid(),
  // Deliberately unvalidated beyond being a string: the id is what grants access,
  // and the email is display-only. Zod's `z.email()` rejects valid addresses such
  // as `josé@example.com`, which would turn a working session into "signed out".
  email: z.string().nullable(),
});

export type VerifiedSession = z.infer<typeof verifiedSessionSchema>;

/** Only `get` is needed, which both `Headers` and Next's `ReadonlyHeaders` provide. */
type HeaderSource = { get(name: string): string | null };

/**
 * Percent-encoded on the way in. A header value must be ASCII, and an email address
 * need not be, so setting it raw would throw for a valid non-ASCII address.
 */
export function encodeVerifiedEmail(email: string): string {
  return encodeURIComponent(email);
}

function decodeEmail(value: string | null): string | null {
  if (value === null || value === "") return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function sessionFromHeaders(
  source: HeaderSource,
): VerifiedSession | null {
  const parsed = verifiedSessionSchema.safeParse({
    id: source.get(VERIFIED_USER_ID_HEADER) ?? "",
    email: decodeEmail(source.get(VERIFIED_USER_EMAIL_HEADER)),
  });
  return parsed.success ? parsed.data : null;
}
