import { describe, expect, it } from "vitest";
import { resolveAppOrigin } from "@/lib/app-origin";

/**
 * The confirmation link's origin decides whether registration can finish at all:
 * GoTrue silently substitutes the Site URL for a redirect it will not allow, and
 * the visitor then lands on `/` with an unused code. These cases pin the order.
 */

describe("resolveAppOrigin", () => {
  it("prefers the request origin over a configured value", () => {
    expect(
      resolveAppOrigin({
        forwardedHost: "inventory-stage.vercel.app",
        protocol: "https",
        configured: "inventory-stage.vercel.app",
      }),
    ).toBe("https://inventory-stage.vercel.app");
  });

  it("keeps a development port and uses http on loopback", () => {
    expect(resolveAppOrigin({ host: "localhost:25000" })).toBe(
      "http://localhost:25000",
    );
  });

  it("assumes https for a deploy host when no protocol header arrived", () => {
    expect(resolveAppOrigin({ host: "inventory-stage.vercel.app" })).toBe(
      "https://inventory-stage.vercel.app",
    );
  });

  it("normalises a trailing slash and trims whitespace in the fallback", () => {
    expect(
      resolveAppOrigin({
        configured: "  https://inventory-stage.vercel.app/\n",
      }),
    ).toBe("https://inventory-stage.vercel.app");
  });

  it("refuses a configured value without a scheme", () => {
    expect(resolveAppOrigin({ configured: "inventory-stage.vercel.app" })).toBe(
      "http://localhost:3000",
    );
  });

  it("refuses a configured value that carries a path, query or hash", () => {
    for (const configured of [
      "https://inventory-stage.vercel.app/auth/confirm",
      "https://inventory-stage.vercel.app/?a=1",
      "https://inventory-stage.vercel.app/#x",
      "not a url",
    ]) {
      expect(resolveAppOrigin({ configured })).toBe("http://localhost:3000");
    }
  });

  it("ignores a host header that is not a host", () => {
    expect(
      resolveAppOrigin({
        forwardedHost: "inventory-stage.vercel.app/auth/confirm",
        protocol: "https",
        configured: "https://inventory-stage.vercel.app",
      }),
    ).toBe("https://inventory-stage.vercel.app");
  });
});
