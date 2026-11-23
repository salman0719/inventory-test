import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * The proxy decides whether a request is signed in, and is the only place that
 * checks. Two things have to hold: local JWKS verification may only be the answer
 * when it produced a subject (otherwise `getUser()` must run, since it is both the
 * authority and what refreshes the session), and whichever path decided must hand
 * the identity on as a request header the render path can read.
 */

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  getUser: vi.fn(),
  next: vi.fn(),
  redirect: vi.fn(),
  setCookie: vi.fn(),
  requestCookieSet: vi.fn(),
  cookiesAdapter: undefined as
    { setAll?: (cookies: unknown[]) => void } | undefined,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: { cookies: { setAll?: (cookies: unknown[]) => void } },
  ) => {
    mocks.cookiesAdapter = options.cookies;
    return { auth: { getClaims: mocks.getClaims, getUser: mocks.getUser } };
  },
}));

vi.mock("next/server", () => ({
  NextResponse: {
    next: (init?: unknown) => mocks.next(init),
    redirect: (url: URL) => mocks.redirect(url),
  },
}));

const { proxy } = await import("@/proxy");

const USER_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_ID = "44444444-4444-4444-8444-444444444444";

/** A request with the three things the proxy touches: URL, headers, cookies. */
function requestFor(pathname: string, headers: Record<string, string> = {}) {
  function nextUrlFor(href: string) {
    const url = new URL(href);
    return Object.assign(url, { clone: () => nextUrlFor(href) });
  }

  return {
    nextUrl: nextUrlFor(`http://localhost:3000${pathname}`),
    headers: new Headers(headers),
    cookies: { getAll: () => [], set: mocks.requestCookieSet },
  } as unknown as NextRequest;
}

/** What the mock `NextResponse.next` returned for the last pass-through. */
function lastNextInit(): { request: NextRequest } {
  const call = mocks.next.mock.calls.at(-1);
  return call?.[0] as { request: NextRequest };
}

beforeEach(() => {
  for (const fn of [
    mocks.getClaims,
    mocks.getUser,
    mocks.next,
    mocks.redirect,
    mocks.setCookie,
    mocks.requestCookieSet,
  ]) {
    fn.mockReset();
  }
  mocks.cookiesAdapter = undefined;
  mocks.next.mockImplementation(() => ({
    kind: "next",
    cookies: { set: mocks.setCookie },
  }));
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

describe("the verified identity handed to the render path", () => {
  it("forwards the locally verified subject and its email claim", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: USER_ID, email: "owner@cafe.test" } },
      error: null,
    });

    await proxy(requestFor("/products"));

    const forwarded = lastNextInit().request.headers;
    expect(forwarded.get("x-verified-user-id")).toBe(USER_ID);
    expect(forwarded.get("x-verified-user-email")).toBe(
      encodeURIComponent("owner@cafe.test"),
    );
  });

  it("forwards the identity the getUser fallback returned", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: USER_ID, email: "owner@cafe.test" } },
      error: null,
    });

    await proxy(requestFor("/products"));

    expect(lastNextInit().request.headers.get("x-verified-user-id")).toBe(
      USER_ID,
    );
  });

  it("overwrites a header the browser supplied", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: USER_ID } },
      error: null,
    });

    await proxy(
      requestFor("/products", {
        "x-verified-user-id": OTHER_ID,
        "x-verified-user-email": encodeURIComponent("attacker@example.com"),
      }),
    );

    const forwarded = lastNextInit().request.headers;
    expect(forwarded.get("x-verified-user-id")).toBe(USER_ID);
    expect(forwarded.get("x-verified-user-email")).toBeNull();
  });

  it("encodes an email a raw header value could not carry", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: USER_ID, email: "josé@example.com" } },
      error: null,
    });

    await proxy(requestFor("/products"));

    const forwarded = lastNextInit().request.headers.get(
      "x-verified-user-email",
    );
    expect(forwarded).toBe(encodeURIComponent("josé@example.com"));
  });

  it("does not forward anything for a signed-out request", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    await proxy(requestFor("/products"));

    expect(mocks.next).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledTimes(1);
  });

  it("keeps refreshed cookies on the response that carries the headers", async () => {
    mocks.getClaims.mockImplementation(async () => {
      mocks.cookiesAdapter?.setAll?.([
        { name: "sb-auth-token", value: "refreshed", options: { path: "/" } },
      ]);
      return { data: { claims: { sub: USER_ID } }, error: null };
    });

    await proxy(requestFor("/products"));

    expect(mocks.setCookie).toHaveBeenCalledWith("sb-auth-token", "refreshed", {
      path: "/",
    });
    expect(lastNextInit().request.headers.get("x-verified-user-id")).toBe(
      USER_ID,
    );
  });

  it("replays the cookies a getUser refresh wrote", async () => {
    // What an expired access token produces: local verification cannot answer, so
    // `getUser()` refreshes the session and the SDK hands the rotated cookies to the
    // adapter. They must reach both the request (the page reads the new session) and
    // the response (the browser has to store it), on a request that still renders.
    mocks.getClaims.mockResolvedValue({
      data: null,
      error: new Error("JWT expired"),
    });
    mocks.getUser.mockImplementation(async () => {
      mocks.cookiesAdapter?.setAll?.([
        { name: "sb-auth-token", value: "rotated", options: { path: "/" } },
      ]);
      return {
        data: { user: { id: USER_ID, email: "owner@cafe.test" } },
        error: null,
      };
    });

    await proxy(requestFor("/products"));

    expect(mocks.getUser).toHaveBeenCalledTimes(1);
    expect(mocks.requestCookieSet).toHaveBeenCalledWith(
      "sb-auth-token",
      "rotated",
    );
    expect(mocks.setCookie).toHaveBeenCalledWith("sb-auth-token", "rotated", {
      path: "/",
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(lastNextInit().request.headers.get("x-verified-user-id")).toBe(
      USER_ID,
    );
  });
});
