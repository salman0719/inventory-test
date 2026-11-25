import { describe, expect, it } from "vitest";
import {
  canReceive,
  outstandingQuantity,
  parseOrderFilter,
  purchaseOrderInputSchema,
  arrivedQuantity,
  isEmptyDeliveryLine,
  quantityField,
  receiptSchema,
  suggestedDeliveryDate,
} from "@/lib/purchase-order-input";

const PRODUCT_A = "11111111-1111-4111-8111-111111111111";
const PRODUCT_B = "22222222-2222-4222-8222-222222222222";
const SUPPLIER = "33333333-3333-4333-8333-333333333333";
const ORDER = "44444444-4444-4444-8444-444444444444";
const KEY = "55555555-5555-4555-8555-555555555555";

function order(overrides: Record<string, unknown> = {}) {
  return {
    supplierId: SUPPLIER,
    expectedDeliveryAt: "2026-11-25",
    notes: "  Deliver after 7am.  ",
    lines: [{ productId: PRODUCT_A, quantity: "12", unitCost: "4.20" }],
    ...overrides,
  };
}

describe("suggestedDeliveryDate", () => {
  it("adds the lead time as calendar days", () => {
    const from = new Date(2026, 10, 25, 15, 30); // 25 Nov 2026, local time

    expect(suggestedDeliveryDate(2, from)).toBe("2026-11-27");
    expect(suggestedDeliveryDate(0, from)).toBe("2026-11-25");
  });

  it("rolls over a month and a year", () => {
    expect(suggestedDeliveryDate(10, new Date(2026, 11, 28))).toBe(
      "2027-01-07",
    );
  });

  it("suggests nothing when the supplier has no lead time", () => {
    expect(suggestedDeliveryDate(null, new Date(2026, 10, 25))).toBeNull();
  });
});

describe("purchaseOrderInputSchema", () => {
  it("accepts a draft with one line and trims the notes", () => {
    const parsed = purchaseOrderInputSchema.parse(order());

    expect(parsed.supplierId).toBe(SUPPLIER);
    expect(parsed.expectedDeliveryAt).toBe("2026-11-25");
    expect(parsed.notes).toBe("Deliver after 7am.");
    expect(parsed.lines[0]).toEqual({
      productId: PRODUCT_A,
      quantity: "12",
      unitCost: "4.20",
    });
  });

  it("keeps an empty delivery date and empty notes as null", () => {
    const parsed = purchaseOrderInputSchema.parse(
      order({ expectedDeliveryAt: "", notes: "   " }),
    );

    expect(parsed.expectedDeliveryAt).toBeNull();
    expect(parsed.notes).toBeNull();
  });

  it("rejects an order with no lines", () => {
    const result = purchaseOrderInputSchema.safeParse(order({ lines: [] }));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "Add at least one line to the order.",
    );
  });

  it("rejects the same product twice, because the table has one line per product", () => {
    const result = purchaseOrderInputSchema.safeParse(
      order({
        lines: [
          { productId: PRODUCT_A, quantity: "1", unitCost: "4.20" },
          { productId: PRODUCT_A, quantity: "2", unitCost: "4.20" },
        ],
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "Each product can appear once. Combine the quantities.",
    );
  });

  it("rejects a zero quantity and a malformed cost", () => {
    const zero = purchaseOrderInputSchema.safeParse(
      order({
        lines: [{ productId: PRODUCT_A, quantity: "0", unitCost: "4.20" }],
      }),
    );
    const cost = purchaseOrderInputSchema.safeParse(
      order({
        lines: [{ productId: PRODUCT_B, quantity: "1", unitCost: "4.205" }],
      }),
    );

    expect(zero.success).toBe(false);
    expect(cost.success).toBe(false);
  });

  it("rejects an impossible date and a missing supplier", () => {
    const date = purchaseOrderInputSchema.safeParse(
      order({ expectedDeliveryAt: "2026-02-30" }),
    );
    const supplier = purchaseOrderInputSchema.safeParse(
      order({ supplierId: "" }),
    );

    expect(date.success).toBe(false);
    expect(supplier.success).toBe(false);
  });
});

describe("receiptSchema", () => {
  it("accepts a split line with an idempotency key", () => {
    const parsed = receiptSchema.parse({
      orderId: ORDER,
      idempotencyKey: KEY,
      lines: [
        {
          lineId: PRODUCT_A,
          accepted: "2",
          damaged: "0.5",
          rejected: "0",
          reason: "One bag split",
        },
      ],
    });

    expect(parsed.lines).toHaveLength(1);
  });

  it("asks for a note when stock arrived damaged or was rejected", () => {
    const bare = receiptSchema.safeParse({
      orderId: ORDER,
      idempotencyKey: KEY,
      lines: [
        {
          lineId: PRODUCT_A,
          accepted: "2",
          damaged: "1",
          rejected: "0",
          reason: "",
        },
      ],
    });
    const noted = receiptSchema.safeParse({
      orderId: ORDER,
      idempotencyKey: KEY,
      lines: [
        {
          lineId: PRODUCT_A,
          accepted: "2",
          damaged: "1",
          rejected: "0",
          reason: "One bag split",
        },
      ],
    });

    expect(bare.success).toBe(false);
    expect(bare.error?.issues[0]?.message).toContain("what was wrong");
    expect(noted.success).toBe(true);
  });

  it("requires at least one line and a key", () => {
    const empty = receiptSchema.safeParse({
      orderId: ORDER,
      idempotencyKey: KEY,
      lines: [],
    });
    const key = receiptSchema.safeParse({
      orderId: ORDER,
      idempotencyKey: "not-a-key",
      lines: [
        {
          lineId: PRODUCT_A,
          accepted: "1",
          damaged: "0",
          rejected: "0",
          reason: "",
        },
      ],
    });

    expect(empty.success).toBe(false);
    expect(key.success).toBe(false);
  });
});

describe("delivery quantities", () => {
  it("adds the three parts without float drift", () => {
    expect(
      arrivedQuantity({ accepted: "0.1", damaged: "0.2", rejected: "0" }),
    ).toBe("0.3");
    expect(
      arrivedQuantity({ accepted: "7", damaged: "1", rejected: "0" }),
    ).toBe("8");
    expect(
      arrivedQuantity({ accepted: "0", damaged: "0", rejected: "0" }),
    ).toBe("0");
  });

  it("treats an all-zero line as an untouched row", () => {
    expect(
      isEmptyDeliveryLine({ accepted: "", damaged: "", rejected: "" }),
    ).toBe(true);
    expect(
      isEmptyDeliveryLine({ accepted: "0", damaged: "0", rejected: "1" }),
    ).toBe(false);
  });
});

describe("order helpers", () => {
  it("shows a stored quantity as a form value without trailing zeros", () => {
    expect(quantityField("6.000")).toBe("6");
    expect(quantityField("6.500")).toBe("6.5");
    expect(quantityField("12")).toBe("12");
  });

  it("clamps outstanding quantity at zero and keeps three decimals", () => {
    expect(outstandingQuantity("10.000", "4.500")).toBe(5.5);
    expect(outstandingQuantity("10", "10")).toBe(0);
    expect(outstandingQuantity("10", "12")).toBe(0);
    expect(outstandingQuantity("0.3", "0.1")).toBe(0.2);
  });

  it("falls back to all orders for an unknown filter", () => {
    expect(parseOrderFilter("open")).toBe("open");
    expect(parseOrderFilter("draft")).toBe("draft");
    expect(parseOrderFilter("nonsense")).toBe("all");
    expect(parseOrderFilter(undefined)).toBe("all");
  });

  it("only receives orders that are ordered or partly received", () => {
    expect(canReceive("ordered")).toBe(true);
    expect(canReceive("partially_received")).toBe(true);
    expect(canReceive("draft")).toBe(false);
    expect(canReceive("received")).toBe(false);
    expect(canReceive("cancelled")).toBe(false);
  });
});
