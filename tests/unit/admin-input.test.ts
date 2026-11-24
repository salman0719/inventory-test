import { describe, expect, it } from "vitest";
import {
  approvalSchema,
  confirmAccountSchema,
  decisionErrorCode,
  decisionSchema,
  parseAdminSearch,
  parseAttachRole,
  parseRegistrationFilter,
} from "@/lib/admin-input";

/**
 * The panel's URL and its decision form are both browser input. A filter that cannot
 * be read must fall back to a safe view, and a decision must carry a real id — the
 * database refuses the rest, but the screen should not send it.
 */

describe("parseRegistrationFilter", () => {
  it("defaults to every status with no search", () => {
    expect(parseRegistrationFilter({})).toEqual({ status: "all", search: "" });
  });

  it("keeps a known status", () => {
    expect(parseRegistrationFilter({ status: "pending" }).status).toBe(
      "pending",
    );
    expect(parseRegistrationFilter({ status: "rejected" }).status).toBe(
      "rejected",
    );
  });

  it("falls back to all for an unknown or repeated status", () => {
    expect(parseRegistrationFilter({ status: "deleted" }).status).toBe("all");
    expect(
      parseRegistrationFilter({ status: ["pending", "approved"] }).status,
    ).toBe("all");
  });

  it("trims the search and ignores one that is too long", () => {
    expect(parseRegistrationFilter({ q: "  rae@example  " }).search).toBe(
      "rae@example",
    );
    expect(parseRegistrationFilter({ q: "a".repeat(81) }).search).toBe("");
  });
});

describe("parseAdminSearch", () => {
  it("trims a search and drops one that is too long", () => {
    expect(parseAdminSearch("  Panel Cafe  ")).toBe("Panel Cafe");
    expect(parseAdminSearch("a".repeat(81))).toBe("");
  });

  it("treats a missing or repeated parameter as no search", () => {
    expect(parseAdminSearch(undefined)).toBe("");
    expect(parseAdminSearch(["one", "two"])).toBe("");
  });
});

describe("decisionSchema", () => {
  const id = "2cad023d-b710-4920-889f-c0d812ca0597";

  it("accepts an id with no note", () => {
    expect(decisionSchema.safeParse({ requestId: id }).success).toBe(true);
  });

  it("trims the note and keeps it under 500 characters", () => {
    const parsed = decisionSchema.safeParse({
      requestId: id,
      note: "  We could not verify the business.  ",
    });
    expect(parsed.data?.note).toBe("We could not verify the business.");

    expect(
      decisionSchema.safeParse({ requestId: id, note: "a".repeat(501) })
        .success,
    ).toBe(false);
  });

  it("refuses an id that is not a uuid", () => {
    expect(decisionSchema.safeParse({ requestId: "all" }).success).toBe(false);
    expect(decisionSchema.safeParse({}).success).toBe(false);
  });
});

describe("decisionErrorCode", () => {
  it("separates the refusals a reviewer can meet", () => {
    expect(
      decisionErrorCode({
        code: "42501",
        message: "Only a platform admin can approve a registration.",
      }),
    ).toBe("not-admin");
    expect(decisionErrorCode({ code: "P0002" })).toBe("missing");
    expect(
      decisionErrorCode({
        code: "22023",
        message: "That registration was rejected.",
      }),
    ).toBe("rejected");
    expect(
      decisionErrorCode({
        code: "22023",
        message: "That registration is already approved.",
      }),
    ).toBe("approved");
  });

  it("separates a missing business from a missing registration", () => {
    expect(
      decisionErrorCode({
        code: "P0002",
        message: "That business does not exist.",
      }),
    ).toBe("no-business");
    expect(
      decisionErrorCode({
        code: "P0002",
        message: "That registration does not exist.",
      }),
    ).toBe("missing");
  });

  it("recognises unusable registration answers", () => {
    expect(
      decisionErrorCode({
        code: "22023",
        message: "The registration answers on that account are not valid.",
      }),
    ).toBe("answers");
  });

  it("recognises a refused role", () => {
    expect(
      decisionErrorCode({
        code: "22023",
        message:
          "Ownership is not transferred from the registration queue; attach as staff or viewer.",
      }),
    ).toBe("role");
    expect(
      decisionErrorCode({
        code: "22023",
        message: "A role only applies when attaching to an existing business.",
      }),
    ).toBe("role");
  });

  it("does not pass SQL text through for anything else", () => {
    expect(decisionErrorCode(new Error("connection reset"))).toBe("failed");
    expect(decisionErrorCode(null)).toBe("failed");
    expect(decisionErrorCode({ code: "22023", message: "other" })).toBe(
      "failed",
    );
  });
});

describe("approvalSchema", () => {
  const id = "2cad023d-b710-4920-889f-c0d812ca0597";
  const business = "5a7b0f8e-1c1d-4a8e-9a3d-9b2f7c4d6e11";

  it("creates a business when no target is posted", () => {
    const parsed = approvalSchema.safeParse({ requestId: id });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ requestId: id, role: "owner" });
  });

  it("attaches as staff or viewer", () => {
    expect(
      approvalSchema.safeParse({
        requestId: id,
        businessId: business,
        role: "staff",
      }).success,
    ).toBe(true);
    expect(
      approvalSchema.safeParse({
        requestId: id,
        businessId: business,
        role: "viewer",
      }).success,
    ).toBe(true);
  });

  it("refuses ownership of an existing business", () => {
    expect(
      approvalSchema.safeParse({
        requestId: id,
        businessId: business,
        role: "owner",
      }).success,
    ).toBe(false);
  });

  it("refuses ids that are not uuids", () => {
    expect(approvalSchema.safeParse({ requestId: "all" }).success).toBe(false);
    expect(
      approvalSchema.safeParse({ requestId: id, businessId: "cafe" }).success,
    ).toBe(false);
  });
});

describe("confirmAccountSchema", () => {
  const id = "2cad023d-b710-4920-889f-c0d812ca0597";

  it("accepts an account id", () => {
    expect(confirmAccountSchema.safeParse({ accountId: id }).success).toBe(
      true,
    );
  });

  it("refuses anything that is not a uuid", () => {
    expect(confirmAccountSchema.safeParse({ accountId: "rae" }).success).toBe(
      false,
    );
    expect(confirmAccountSchema.safeParse({}).success).toBe(false);
  });
});

describe("parseAttachRole", () => {
  it("keeps a known role and falls back to staff", () => {
    expect(parseAttachRole("viewer")).toBe("viewer");
    expect(parseAttachRole("staff")).toBe("staff");
    expect(parseAttachRole("owner")).toBe("staff");
    expect(parseAttachRole(undefined)).toBe("staff");
    expect(parseAttachRole(["staff", "viewer"])).toBe("staff");
  });
});
