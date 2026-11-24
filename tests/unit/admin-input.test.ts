import { describe, expect, it } from "vitest";
import {
  decisionErrorCode,
  decisionSchema,
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

  it("does not pass SQL text through for anything else", () => {
    expect(decisionErrorCode(new Error("connection reset"))).toBe("failed");
    expect(decisionErrorCode(null)).toBe("failed");
    expect(decisionErrorCode({ code: "22023", message: "other" })).toBe(
      "failed",
    );
  });
});
