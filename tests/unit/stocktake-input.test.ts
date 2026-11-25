import { describe, expect, it } from "vitest";
import {
  stocktakeCountSchema,
  stocktakeScopeSchema,
} from "@/lib/stocktake-input";

const SESSION = "22222222-2222-4222-8222-222222222222";
const LINE = "33333333-3333-4333-8333-333333333333";
const OTHER_LINE = "44444444-4444-4444-8444-444444444444";

describe("stocktakeScopeSchema", () => {
  it("turns an empty form into 'all active products'", () => {
    const parsed = stocktakeScopeSchema.parse({
      categoryId: "",
      search: "   ",
    });
    expect(parsed).toEqual({ categoryId: "", search: "" });
  });

  it("keeps a chosen category and a trimmed search", () => {
    const parsed = stocktakeScopeSchema.parse({
      categoryId: "11111111-1111-4111-8111-111111111111",
      search: "  coffee ",
    });
    expect(parsed.search).toBe("coffee");
    expect(parsed.categoryId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("refuses a category that is not an id and a search over 80 characters", () => {
    const category = stocktakeScopeSchema.safeParse({
      categoryId: "dry-goods",
      search: "",
    });
    const search = stocktakeScopeSchema.safeParse({
      categoryId: "",
      search: "x".repeat(81),
    });

    expect(category.success).toBe(false);
    expect(search.success).toBe(false);
  });
});

describe("stocktakeCountSchema", () => {
  it("accepts blank counts while saving", () => {
    const parsed = stocktakeCountSchema.safeParse({
      sessionId: SESSION,
      intent: "save",
      lines: [
        { lineId: LINE, counted: "" },
        { lineId: OTHER_LINE, counted: "  " },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts whole and decimal counts up to three places", () => {
    for (const counted of ["0", "7", "2.5", "12.345"]) {
      const parsed = stocktakeCountSchema.safeParse({
        sessionId: SESSION,
        intent: "save",
        lines: [{ lineId: LINE, counted }],
      });
      expect(parsed.success).toBe(true);
    }
  });

  it("refuses a word, a negative count and the same line twice", () => {
    const word = stocktakeCountSchema.safeParse({
      sessionId: SESSION,
      intent: "save",
      lines: [{ lineId: LINE, counted: "seven" }],
    });
    const negative = stocktakeCountSchema.safeParse({
      sessionId: SESSION,
      intent: "save",
      lines: [{ lineId: LINE, counted: "-1" }],
    });
    const duplicate = stocktakeCountSchema.safeParse({
      sessionId: SESSION,
      intent: "save",
      lines: [
        { lineId: LINE, counted: "1" },
        { lineId: LINE, counted: "2" },
      ],
    });

    expect(word.success).toBe(false);
    expect(negative.success).toBe(false);
    expect(duplicate.success).toBe(false);
    expect(duplicate.success ? null : duplicate.error.issues[0]?.message).toBe(
      "Each product appears once on a stocktake.",
    );
  });

  it("refuses to complete a sheet with nothing counted", () => {
    const parsed = stocktakeCountSchema.safeParse({
      sessionId: SESSION,
      intent: "complete",
      lines: [{ lineId: LINE, counted: "" }],
    });

    expect(parsed.success).toBe(false);
    expect(parsed.success ? null : parsed.error.issues[0]?.message).toBe(
      "Count at least one product before completing the stocktake.",
    );
  });

  it("accepts completing with a count", () => {
    const parsed = stocktakeCountSchema.safeParse({
      sessionId: SESSION,
      intent: "complete",
      lines: [
        { lineId: LINE, counted: "0" },
        { lineId: OTHER_LINE, counted: "" },
      ],
    });

    expect(parsed.success).toBe(true);
  });
});
