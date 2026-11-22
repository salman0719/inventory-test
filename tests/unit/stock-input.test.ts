import { describe, expect, it } from "vitest";
import {
  formatSignedQuantity,
  parseStockFilter,
  parseStockSort,
  signedQuantity,
  stockMovementSchema,
} from "@/lib/stock-input";

const PRODUCT = "7de96fda-b270-41b8-93d9-f9dd4ae50130";

function movement(overrides: Record<string, string> = {}) {
  return {
    productId: PRODUCT,
    movementType: "stock_in",
    quantity: "5",
    reason: "",
    ...overrides,
  };
}

function messageFor(input: Record<string, string>): string {
  const parsed = stockMovementSchema.safeParse(input);
  if (parsed.success) throw new Error("expected the input to be rejected");
  return parsed.error.issues[0]?.message ?? "";
}

describe("stockMovementSchema", () => {
  it("accepts a stock in with no reason", () => {
    const parsed = stockMovementSchema.safeParse(movement());

    expect(parsed.success).toBe(true);
    expect(parsed.data?.quantity).toBe("5");
  });

  it("accepts fractional quantities to three places", () => {
    const parsed = stockMovementSchema.safeParse(
      movement({ quantity: "2.500", movementType: "stock_out" }),
    );

    expect(parsed.success).toBe(true);
    expect(signedQuantity("stock_out", undefined, "2.500")).toBe("-2.500");
  });

  it("rejects a zero quantity", () => {
    expect(messageFor(movement({ quantity: "0" }))).toBe(
      "Enter a quantity above zero.",
    );
  });

  it("rejects a typed minus sign, because direction is a choice", () => {
    expect(messageFor(movement({ quantity: "-3" }))).toBe(
      "Enter the quantity as a number, for example 6 or 2.5.",
    );
  });

  it("rejects more than three decimal places", () => {
    expect(messageFor(movement({ quantity: "1.2345" }))).toBe(
      "Enter the quantity as a number, for example 6 or 2.5.",
    );
  });

  it("requires a direction and a reason for an adjustment", () => {
    const noDirection = stockMovementSchema.safeParse(
      movement({ movementType: "adjustment", reason: "Stock-take" }),
    );
    const noReason = stockMovementSchema.safeParse(
      movement({ movementType: "adjustment", direction: "out", reason: "" }),
    );

    expect(noDirection.success).toBe(false);
    expect(noDirection.error?.issues[0]?.message).toBe(
      "Choose whether the adjustment adds or removes stock.",
    );
    expect(noReason.success).toBe(false);
    expect(noReason.error?.issues[0]?.message).toBe(
      "Give a reason for the adjustment.",
    );
  });

  it("accepts an adjustment with both", () => {
    const parsed = stockMovementSchema.safeParse(
      movement({
        movementType: "adjustment",
        direction: "out",
        quantity: "1",
        reason: "Broken bottle",
      }),
    );

    expect(parsed.success).toBe(true);
    expect(signedQuantity("adjustment", parsed.data?.direction, "1")).toBe(
      "-1",
    );
  });

  it("rejects a missing product", () => {
    expect(messageFor(movement({ productId: "" }))).toBe(
      "Open a product before recording stock.",
    );
  });
});

describe("inventory URL state", () => {
  it("falls back to all stock for an unknown filter", () => {
    expect(parseStockFilter("urgent")).toBe("all");
    expect(parseStockFilter("low")).toBe("low");
    expect(parseStockFilter(undefined)).toBe("all");
  });

  it("falls back to name order for an unknown sort", () => {
    expect(parseStockSort("cheapest")).toBe("name");
    expect(parseStockSort("high")).toBe("high");
  });
});

describe("formatSignedQuantity", () => {
  it("shows the sign a ledger line needs", () => {
    expect(formatSignedQuantity("12.000")).toBe("+12");
    expect(formatSignedQuantity("-2.500")).toBe("-2.5");
  });

  it("treats zero and blanks as no value", () => {
    expect(formatSignedQuantity("0")).toBe("—");
    expect(formatSignedQuantity(null)).toBe("—");
  });
});
