import { describe, expect, it } from "vitest";
import {
  parseSignupMetadata,
  registerErrorMessage,
  registerSchema,
} from "@/lib/signup";

/**
 * Registration is the only way into the product, so the boundary is pinned here:
 * what the form may submit, and what a browser-supplied metadata field may become.
 */

const VALID = {
  fullName: "Rae Test",
  businessName: "Rae's Cafe",
  businessType: "cafe",
  email: "rae@example.invalid",
  password: "milk-and-honey",
};

describe("registerSchema", () => {
  it("accepts a complete registration and trims the names", () => {
    const parsed = registerSchema.safeParse({
      ...VALID,
      fullName: "  Rae Test  ",
      businessName: "  Rae's Cafe ",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.fullName).toBe("Rae Test");
    expect(parsed.data?.businessName).toBe("Rae's Cafe");
  });

  it("requires eight characters of password", () => {
    const parsed = registerSchema.safeParse({ ...VALID, password: "short" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe("Use at least 8 characters.");
  });

  it("rejects a password longer than bcrypt accepts", () => {
    const parsed = registerSchema.safeParse({
      ...VALID,
      password: "a".repeat(73),
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(
      "Use 72 characters or fewer.",
    );
  });

  it("rejects a malformed address and an unknown business type", () => {
    expect(registerSchema.safeParse({ ...VALID, email: "rae@" }).success).toBe(
      false,
    );
    expect(
      registerSchema.safeParse({ ...VALID, businessType: "warehouse" }).success,
    ).toBe(false);
  });
});

describe("parseSignupMetadata", () => {
  it("maps the fields the registration form stored", () => {
    expect(
      parseSignupMetadata({
        full_name: "Rae Test",
        business_name: "Rae's Cafe",
        business_type: "cafe",
        unrelated: "ignored",
      }),
    ).toEqual({
      fullName: "Rae Test",
      businessName: "Rae's Cafe",
      businessType: "cafe",
    });
  });

  it("returns null for an account that did not come from the form", () => {
    expect(parseSignupMetadata({})).toBeNull();
    expect(
      parseSignupMetadata({
        full_name: "Rae Test",
        business_name: "Rae's Cafe",
        business_type: "not-a-type",
      }),
    ).toBeNull();
    expect(
      parseSignupMetadata({
        full_name: 42,
        business_name: "Rae's Cafe",
        business_type: "cafe",
      }),
    ).toBeNull();
  });
});

describe("registerErrorMessage", () => {
  it("tells the truth about the hourly project allowance", () => {
    const message = registerErrorMessage(
      "over_email_send_rate_limit",
      "email rate limit exceeded",
    );
    expect(message).toContain("two an hour");
    expect(message).not.toContain("wait a minute");
  });

  it("separates the 60-second wait on one address from the hourly cap", () => {
    const message = registerErrorMessage(
      "over_email_send_rate_limit",
      "For security purposes, you can only request this after 56 seconds.",
    );
    expect(message).toContain("wait a minute");
    expect(message).not.toContain("two an hour");
  });

  it("names the per-network limit and the team-only mailer", () => {
    expect(registerErrorMessage("over_request_rate_limit")).toContain(
      "this network",
    );
    expect(registerErrorMessage("email_address_not_authorized")).toContain(
      "its own team",
    );
  });

  it("keeps the specific answers for a bad password, address or closed sign-up", () => {
    expect(registerErrorMessage("weak_password")).toContain(
      "stronger password",
    );
    expect(registerErrorMessage("email_address_invalid")).toContain(
      "valid email",
    );
    expect(registerErrorMessage("signup_disabled")).toContain(
      "Registration is closed",
    );
  });

  it("falls back to a plain retry for anything unknown", () => {
    expect(registerErrorMessage(undefined)).toBe(
      "We could not create the account. Try again in a moment.",
    );
    expect(registerErrorMessage("something_new")).toBe(
      "We could not create the account. Try again in a moment.",
    );
  });
});
