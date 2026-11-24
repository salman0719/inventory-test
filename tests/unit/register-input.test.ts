import { describe, expect, it } from "vitest";
import { parseSignupMetadata, registerSchema } from "@/lib/signup";

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
