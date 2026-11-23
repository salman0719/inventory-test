import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * The proxy decides whether a request is signed in. Local JWKS verification is the
 * cheap path, but it may only be the answer when it actually produced a subject: a
 * failed or missing claim has to reach `getUser()`, which is the authority and is
 * also what refreshes the session and writes new cookies.
 */

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  getUser: vi.fn(),
  next: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getClaims: mocks.getClaims, getUser: mocks.getUser },
  }),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    next: (init?: unknown) => mocks.next(init),
    redirect: (url: URL) => mocks.redirect(url),
  },
}));

const { proxy } = await import("@/proxy");

const USER_ID = "33333333-3333-4333-8333-333333333333";

/** A request just big enough for the proxy: a mutable URL and readable cookies. */
function requestFor(pathname: string): NextRequest {
  function nextUrlFor(href: string) {
    const url = new URL(href);
    return Object.assign(url, { clone: () => nextUrlFor(href) });
  }

  return {
    nextUrl: nextUrlFor(`http://localhost:3000${pathname}`),
    cookies: { getAll: () => [] },
  } as unknown as NextRequest;
}

beforeEach(() => {
  mocks.getClaims.mockReset();
  mocks.getUser.mockReset();
  mocks.next.mockReset();
  mocks.redirect.mockReset();
  mocks.next.mockReturnValue({ kind: "next" });
  mocks.redirect.mockImplementation((url: URL) => ({ kind: "redirect", url }));
});

describe("the proxy session check", () => {
  it("trusts a locally verified subject and never calls getUser", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: USER_ID } },
      error: null,
    });

    await proxy(requestFor("/products"));

    expect(mocks.getClaims).toHaveBeenCalledTimes(1);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.next).toHaveBeenCalledTimes(1);
  });

  it("acts on the verified subject: a signed-in visit to sign-in is sent home", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: USER_ID } },
      error: null,
    });

    await proxy(requestFor("/sign-in"));

    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    const url = mocks.redirect.mock.calls[0]?.[0] as URL;
    expect(url.pathname).toBe("/");
  });

  it.each([
    ["a failed verification", { data: null, error: new Error("invalid JWT") }],
    ["no data at all", { data: null, error: null }],
    [
      "claims without a subject",
      { data: { claims: { role: "authenticated" } }, error: null },
    ],
    ["an empty subject", { data: { claims: { sub: "" } }, error: null }],
  ])("falls back to getUser for %s", async (_case, claims) => {
    mocks.getClaims.mockResolvedValue(claims);
    mocks.getUser.mockResolvedValue({
      data: { user: { id: USER_ID } },
      error: null,
    });

    await proxy(requestFor("/products"));

    expect(mocks.getUser).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.next).toHaveBeenCalledTimes(1);
  });

  it("redirects to sign-in when the fallback finds no user", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    await proxy(requestFor("/products?page=2"));

    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    const url = mocks.redirect.mock.calls[0]?.[0] as URL;
    expect(url.pathname).toBe("/sign-in");
    expect(url.searchParams.get("next")).toBe("/products?page=2");
  });
});
