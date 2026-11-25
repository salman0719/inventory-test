import { describe, expect, it } from "vitest";
import {
  formatQuantity,
  parseProductSort,
  productInputSchema,
  stockStatus,
} from "../../src/lib/product-input";

const valid = {
  name: "Tomatoes, truss",
  sku: "caf-0001",
  supplierSku: "",
  categoryId: "",
  supplierId: "",
  unitOfMeasure: "kg",
  costPrice: "4.20",
  sellingPrice: "",
  reorderLevel: "6",
  description: "",
};

function parse(overrides: Partial<typeof valid>) {
  return productInputSchema.safeParse({ ...valid, ...overrides });
}

describe("product input", () => {
  it("normalises SKU case and turns blank optionals into null", () => {
    const result = parse({});
    expect(result.success).toBe(true);
    expect(result.data?.sku).toBe("CAF-0001");
    expect(result.data?.sellingPrice).toBeNull();
    expect(result.data?.categoryId).toBeNull();
    expect(result.data?.description).toBeNull();
  });

  it("keeps money as a numeric string so nothing rounds before Postgres", () => {
    const result = parse({ costPrice: "4.5", sellingPrice: "9.95" });
    expect(result.data?.costPrice).toBe("4.5");
    expect(result.data?.sellingPrice).toBe("9.95");
  });

  it("rejects a blank name, a bad SKU and a negative amount", () => {
    expect(parse({ name: "  " }).success).toBe(false);
    expect(parse({ sku: "has space" }).success).toBe(false);
    expect(parse({ costPrice: "-1.00" }).success).toBe(false);
    expect(parse({ costPrice: "4.555" }).success).toBe(false);
  });

  it("rejects a category id that is not a uuid", () => {
    expect(parse({ categoryId: "cafe" }).success).toBe(false);
    expect(
      parse({ categoryId: "11111111-1111-4111-8111-111111111111" }).success,
    ).toBe(true);
  });

  it("treats a zero reorder level as valid and a non-numeric one as invalid", () => {
    expect(parse({ reorderLevel: "0" }).success).toBe(true);
    expect(parse({ reorderLevel: "low" }).success).toBe(false);
  });

  it("keeps the supplier code as typed, or null when blank", () => {
    expect(parse({}).data?.supplierSku).toBeNull();
    expect(parse({ supplierSku: "  FF/100-A " }).data?.supplierSku).toBe(
      "FF/100-A",
    );
    expect(parse({ supplierSku: "x".repeat(61) }).success).toBe(false);
  });
});

describe("stock status", () => {
  it("is out at zero or below, low at or under the reorder level", () => {
    expect(stockStatus("0", "6")).toBe("out");
    expect(stockStatus("18.000", "6")).toBe("ok");
    expect(stockStatus("6.000", "6")).toBe("low");
    expect(stockStatus("2", "6")).toBe("low");
  });

  it("does not call everything low when no reorder level is set", () => {
    expect(stockStatus("1", "0")).toBe("ok");
  });
});

describe("presentation", () => {
  it("drops trailing zeros from quantities", () => {
    expect(formatQuantity("18.000")).toBe("18");
    expect(formatQuantity("2.500")).toBe("2.5");
    expect(formatQuantity(null)).toBe("—");
  });

  it("falls back to name order for an unknown sort key", () => {
    expect(parseProductSort("cost")).toBe("cost");
    expect(parseProductSort("drop table")).toBe("name");
    expect(parseProductSort(undefined)).toBe("name");
  });
});
