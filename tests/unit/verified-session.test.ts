import { describe, expect, it } from "vitest";
import {
  encodeVerifiedEmail,
  sessionFromHeaders,
} from "@/lib/verified-session";

/**
 * The render path trusts these headers because the proxy overwrites them, so the
 * parse has to be strict: a missing or malformed id is "no session", not a partial
 * one, and a mangled email must not throw inside a Server Component.
 */

const USER_ID = "33333333-3333-4333-8333-333333333333";

function headers(entries: Record<string, string> = {}) {
  return new Headers(entries);
}

describe("the verified session headers", () => {
  it("reads the id and email the proxy set", () => {
    const session = sessionFromHeaders(
      headers({
        "x-verified-user-id": USER_ID,
        "x-verified-user-email": encodeVerifiedEmail("owner@cafe.test"),
      }),
    );
    expect(session).toEqual({ id: USER_ID, email: "owner@cafe.test" });
  });

  it("treats a missing email as no email, not as a broken session", () => {
    const session = sessionFromHeaders(
      headers({ "x-verified-user-id": USER_ID }),
    );
    expect(session).toEqual({ id: USER_ID, email: null });
  });

  it("round-trips an address a raw header value could not hold", () => {
    const session = sessionFromHeaders(
      headers({
        "x-verified-user-id": USER_ID,
        "x-verified-user-email": encodeVerifiedEmail("josé@example.com"),
      }),
    );
    expect(session?.email).toBe("josé@example.com");
  });

  it.each([
    ["no headers at all", {}],
    ["an empty id", { "x-verified-user-id": "" }],
    ["an id that is not a uuid", { "x-verified-user-id": "someone" }],
  ])("fails closed for %s", (_case, entries) => {
    expect(sessionFromHeaders(headers(entries))).toBeNull();
  });

  it("keeps the session when only the email is malformed", () => {
    const session = sessionFromHeaders(
      headers({
        "x-verified-user-id": USER_ID,
        "x-verified-user-email": "%E0%A4%A",
      }),
    );
    expect(session).toEqual({ id: USER_ID, email: null });
  });
});
