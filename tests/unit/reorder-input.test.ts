import { describe, expect, it } from "vitest";
import {
  reorderSelectionSchema,
  reorderTarget,
  suggestedReorderQuantity,
} from "../../src/lib/reorder-input";

const supplierId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const secondProductId = "33333333-3333-4333-8333-333333333333";

function parse(overrides: Record<string, unknown> = {}) {
  return reorderSelectionSchema.safeParse({
    supplierId,
    lines: [{ productId, quantity: "4" }],
    ...overrides,
  });
}

describe("the reorder target", () => {
  it("uses a stored target, including zero", () => {
    expect(reorderTarget("12", "4")).toEqual({ quantity: "12", source: "set" });
    expect(reorderTarget("0", "4")).toEqual({ quantity: "0", source: "set" });
  });

  it("doubles the reorder level only when the target is null", () => {
    expect(reorderTarget(null, "4.5")).toEqual({
      quantity: "9",
      source: "fallback",
    });
    expect(reorderTarget(null, "0")).toEqual({
      quantity: "0",
      source: "fallback",
    });
  });
});

describe("the suggested quantity", () => {
  it("subtracts on hand and what is already on order", () => {
    expect(
      suggestedReorderQuantity({
        targetStockLevel: "10",
        reorderLevel: "4",
        onHand: "3",
        onOrder: "2",
      }),
    ).toBe("5");
  });

  it("never goes below zero", () => {
    expect(
      suggestedReorderQuantity({
        targetStockLevel: "4",
        reorderLevel: "2",
        onHand: "5",
        onOrder: "3",
      }),
    ).toBe("0");
  });

  it("keeps three-decimal quantities exact", () => {
    expect(
      suggestedReorderQuantity({
        targetStockLevel: null,
        reorderLevel: "0.2",
        onHand: "0.1",
        onOrder: "0.1",
      }),
    ).toBe("0.2");
  });

  it("lets the fallback follow the reorder level", () => {
    expect(
      suggestedReorderQuantity({
        targetStockLevel: null,
        reorderLevel: "5",
        onHand: "4",
        onOrder: "0",
      }),
    ).toBe("6");
  });
});

describe("a reorder selection", () => {
  it("accepts a product and a positive quantity", () => {
    expect(parse().success).toBe(true);
  });

  it("needs a supplier, a product and a quantity above zero", () => {
    expect(parse({ supplierId: "nope" }).success).toBe(false);
    expect(parse({ lines: [] }).success).toBe(false);
    expect(parse({ lines: [{ productId, quantity: "0" }] }).success).toBe(
      false,
    );
    expect(parse({ lines: [{ productId, quantity: "-1" }] }).success).toBe(
      false,
    );
    expect(
      parse({ lines: [{ productId: "not-a-uuid", quantity: "2" }] }).success,
    ).toBe(false);
  });

  it("refuses the same product twice", () => {
    const result = parse({
      lines: [
        { productId, quantity: "2" },
        { productId, quantity: "3" },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "Each product can appear once.",
    );
  });

  it("accepts two different products", () => {
    expect(
      parse({
        lines: [
          { productId, quantity: "2" },
          { productId: secondProductId, quantity: "1.5" },
        ],
      }).success,
    ).toBe(true);
  });
});
