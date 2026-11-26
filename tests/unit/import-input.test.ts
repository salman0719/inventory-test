import { describe, expect, it } from "vitest";
import {
  decodeCsvBytes,
  evaluateImport,
  importRequestSchema,
  mapHeaders,
  mapRows,
  normaliseCell,
  normaliseHeader,
  normaliseImportRow,
  parseMoneyText,
  trimTrailingBlankRows,
  parseQuantityText,
  type ImportLookups,
  type ImportOptions,
  type RowCandidate,
} from "../../src/lib/import-input";

const baseOptions: ImportOptions = {
  updateExisting: false,
  createSuppliers: false,
  createCategories: false,
  partial: false,
};

const lookups: ImportLookups = {
  products: [],
  suppliers: ["Polar Line Frozen"],
  categories: ["Coffee"],
};

function candidate(
  rowNumber: number,
  source: RowCandidate["source"],
): RowCandidate {
  return { rowNumber, source };
}

function evaluate(
  candidates: RowCandidate[],
  overrides: {
    options?: Partial<ImportOptions>;
    lookups?: Partial<ImportLookups>;
    defaultSupplierName?: string | null;
  } = {},
) {
  return evaluateImport({
    candidates,
    options: { ...baseOptions, ...overrides.options },
    lookups: { ...lookups, ...overrides.lookups },
    defaultSupplierName: overrides.defaultSupplierName ?? null,
  });
}

describe("header mapping", () => {
  it("maps exact labels and keys", () => {
    const mapped = mapHeaders([
      "Product name",
      "SKU",
      "Cost price",
      "Opening stock",
    ]);
    expect(mapped.map((entry) => entry.field)).toEqual([
      "name",
      "sku",
      "costPrice",
      "opening",
    ]);
    expect(mapped.every((entry) => entry.source === "header")).toBe(true);
  });

  it("maps known aliases", () => {
    const mapped = mapHeaders([
      "Item",
      "Our Ref",
      "Trade Price",
      "Qty on hand",
    ]);
    expect(mapped.map((entry) => entry.field)).toEqual([
      "name",
      "sku",
      "costPrice",
      "opening",
    ]);
    expect(mapped.every((entry) => entry.source === "alias")).toBe(true);
  });

  it("treats a lone Description as the product name", () => {
    const mapped = mapHeaders(["Description", "Code", "Price"]);
    expect(mapped[0]?.field).toBe("name");
    expect(mapped[0]?.source).toBe("alias");
  });

  it("keeps Description as notes when a name column exists", () => {
    const mapped = mapHeaders(["Product", "Description", "SKU"]);
    expect(mapped.map((entry) => entry.field)).toEqual([
      "name",
      "description",
      "sku",
    ]);
  });

  it("does not map two columns to one field", () => {
    const mapped = mapHeaders(["SKU", "Code", "Product"]);
    expect(mapped[0]?.field).toBe("sku");
    expect(mapped[1]?.field).toBeNull();
  });

  it("normalises case, punctuation and currency marks in headers", () => {
    expect(normaliseHeader("  $Cost Price ")).toBe("cost price");
    expect(normaliseHeader("Qty_on-hand")).toBe("qty on hand");
  });
});

describe("cell and number normalisation", () => {
  it("strips a BOM and the export's leading apostrophe", () => {
    expect(normaliseCell("\uFEFF'00123")).toBe("00123");
  });

  it("accepts dollars, thousands and plain decimals", () => {
    expect(parseMoneyText("$4.50", "cost")).toEqual({
      ok: true,
      value: "4.50",
    });
    expect(parseMoneyText("1,234.56", "cost")).toEqual({
      ok: true,
      value: "1234.56",
    });
    expect(parseMoneyText("0", "cost")).toEqual({ ok: true, value: "0" });
  });

  it("refuses a comma decimal rather than guessing a locale", () => {
    const result = parseMoneyText("1,5", "the cost price");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("full stop");
  });

  it("refuses negatives and more than two decimal places", () => {
    expect(parseMoneyText("-2.00", "cost").ok).toBe(false);
    expect(parseMoneyText("2.005", "cost").ok).toBe(false);
  });

  it("accepts three decimal places for quantities only", () => {
    expect(parseQuantityText("2.500", "opening")).toEqual({
      ok: true,
      value: "2.500",
    });
    expect(parseQuantityText("1,250", "opening")).toEqual({
      ok: true,
      value: "1250",
    });
  });
});

describe("CSV file text", () => {
  it("decodes UTF-8 and removes a BOM", () => {
    const bytes = new Uint8Array([
      0xef,
      0xbb,
      0xbf,
      ...new TextEncoder().encode("Product,SKU"),
    ]);
    expect(decodeCsvBytes(bytes)).toEqual({
      text: "Product,SKU",
      encoding: "utf-8",
    });
  });

  it("decodes Windows-1252 accents instead of replacing them", () => {
    const bytes = new Uint8Array([0x43, 0x61, 0x66, 0xe9]);
    expect(decodeCsvBytes(bytes)).toEqual({
      text: "Café",
      encoding: "windows-1252",
    });
  });

  it("decodes UTF-16LE with a BOM", () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x4e, 0x00, 0x61, 0x00]);
    expect(decodeCsvBytes(bytes)).toEqual({
      text: "Na",
      encoding: "utf-16le",
    });
  });

  it("keeps interior blank rows and trims trailing ones", () => {
    expect(
      trimTrailingBlankRows([
        ["Product", "SKU"],
        ["Coffee", "CAF-001"],
        [""],
        ["   "],
        ["Tea", "CAF-002"],
        [""],
      ]),
    ).toEqual([
      ["Product", "SKU"],
      ["Coffee", "CAF-001"],
      [""],
      ["   "],
      ["Tea", "CAF-002"],
    ]);
  });
});

describe("row normalisation", () => {
  it("uppercases the SKU but keeps leading zeros and barcode text", () => {
    const { values, errors } = normaliseImportRow({
      name: "  Oat   milk ",
      sku: "caf-0012",
      barcode: "0012345678905",
      costPrice: "$4.50",
      unit: "",
    });
    expect(errors).toEqual([]);
    expect(values).toMatchObject({
      name: "Oat milk",
      sku: "CAF-0012",
      barcode: "0012345678905",
      costPrice: "4.50",
      unit: "ea",
      opening: "0",
      reorderLevel: "0",
    });
  });

  it("returns every field error at once", () => {
    const { values, errors } = normaliseImportRow({
      name: "",
      sku: "bad sku",
      costPrice: "1,5",
      opening: "-3",
      unit: "a-unit-that-is-too-long",
    });
    expect(values).toBeNull();
    expect(errors.length).toBeGreaterThanOrEqual(4);
  });
});

describe("evaluation", () => {
  it("accepts a new product with a known supplier and category", () => {
    const result = evaluate([
      candidate(2, {
        name: "House blend",
        sku: "CAF-001",
        supplier: "Polar Line Frozen",
        category: "Coffee",
        costPrice: "18.50",
        sellingPrice: "32.00",
        opening: "12",
      }),
    ]);
    expect(result.valid).toBe(true);
    expect(result.counts.newRows).toBe(1);
    expect(result.rows[0]?.warnings).toEqual([]);
  });

  it("counts blank rows as skipped, not errors", () => {
    const result = evaluate([candidate(2, { name: "", sku: "" })]);
    expect(result.counts.skippedRows).toBe(1);
    expect(result.counts.errorRows).toBe(0);
    expect(result.valid).toBe(true);
  });

  it("refuses a duplicate SKU inside the file", () => {
    const result = evaluate([
      candidate(2, {
        name: "Coffee",
        sku: "CAF-001",
        supplier: "Polar Line Frozen",
      }),
      candidate(3, {
        name: "Coffee again",
        sku: "caf-001",
        supplier: "Polar Line Frozen",
      }),
    ]);
    expect(result.counts.newRows).toBe(1);
    expect(result.counts.errorRows).toBe(1);
    expect(result.rows[1]?.errors[0]).toContain("row 2");
  });

  it("blocks an existing SKU unless update is chosen", () => {
    const products = [{ id: "p1", sku: "CAF-001", name: "Coffee" }];
    const blocked = evaluate(
      [
        candidate(2, {
          name: "Coffee",
          sku: "CAF-001",
          supplier: "Polar Line Frozen",
        }),
      ],
      { lookups: { products } },
    );
    expect(blocked.rows[0]?.status).toBe("error");

    const updated = evaluate(
      [
        candidate(2, {
          name: "Coffee",
          sku: "CAF-001",
          supplier: "Polar Line Frozen",
        }),
      ],
      { lookups: { products }, options: { updateExisting: true } },
    );
    expect(updated.rows[0]?.status).toBe("update");
    expect(updated.rows[0]?.warnings[0]).toContain("updated");
  });

  it("refuses opening stock on an existing product", () => {
    const result = evaluate(
      [
        candidate(2, {
          name: "Coffee",
          sku: "CAF-001",
          supplier: "Polar Line Frozen",
          opening: "5",
        }),
      ],
      {
        lookups: { products: [{ id: "p1", sku: "CAF-001", name: "Coffee" }] },
        options: { updateExisting: true },
      },
    );
    expect(result.rows[0]?.status).toBe("error");
    expect(result.rows[0]?.errors[0]).toContain("stock adjustment");
  });

  it("refuses an unknown supplier unless creation is chosen", () => {
    const row = candidate(2, {
      name: "Beans",
      sku: "CAF-002",
      supplier: "Roast Lab",
    });
    expect(evaluate([row]).rows[0]?.status).toBe("error");

    const created = evaluate([row], { options: { createSuppliers: true } });
    expect(created.rows[0]?.status).toBe("new");
    expect(created.newSuppliers).toEqual(["Roast Lab"]);
    expect(created.rows[0]?.warnings[0]).toContain("will be created");
  });

  it("refuses an ambiguous supplier name", () => {
    const result = evaluate(
      [
        candidate(2, {
          name: "Beans",
          sku: "CAF-002",
          supplier: "Roast Lab",
        }),
      ],
      { lookups: { suppliers: ["Roast Lab", "Roast Lab"] } },
    );
    expect(result.rows[0]?.status).toBe("error");
    expect(result.rows[0]?.errors[0]).toContain("Two suppliers");
  });

  it("offers to create a new category when allowed", () => {
    const row = candidate(2, {
      name: "Beans",
      sku: "CAF-002",
      supplier: "Polar Line Frozen",
      category: "Tea",
    });
    expect(evaluate([row]).rows[0]?.status).toBe("error");

    const created = evaluate([row], { options: { createCategories: true } });
    expect(created.rows[0]?.status).toBe("new");
    expect(created.newCategories).toEqual(["Tea"]);
  });

  it("warns when cost is above selling", () => {
    const result = evaluate([
      candidate(2, {
        name: "Beans",
        sku: "CAF-002",
        supplier: "Polar Line Frozen",
        costPrice: "10",
        sellingPrice: "8",
      }),
    ]);
    expect(result.counts.warningRows).toBe(1);
    expect(result.rows[0]?.warnings[0]).toContain("swapped");
  });

  it("uses the file supplier when the row has none", () => {
    const result = evaluate([candidate(2, { name: "Beans", sku: "CAF-002" })], {
      defaultSupplierName: "Polar Line Frozen",
    });
    expect(result.rows[0]?.status).toBe("new");
  });
});

describe("request schema", () => {
  const request = {
    filename: "products.csv",
    rowOffset: 2,
    rows: [["Coffee", "CAF-001"]],
    mapping: [
      { index: 0, field: "name" as const },
      { index: 1, field: "sku" as const },
    ],
    defaultSupplierId: null,
    options: baseOptions,
    idempotencyKey: "00000000-0000-4000-8000-000000000000",
  };

  it("accepts a bounded payload", () => {
    expect(importRequestSchema.safeParse(request).success).toBe(true);
  });

  it("rejects more than 500 rows", () => {
    const rows = Array.from({ length: 501 }, () => ["Coffee", "CAF-001"]);
    expect(importRequestSchema.safeParse({ ...request, rows }).success).toBe(
      false,
    );
  });

  it("rejects more than 40 columns", () => {
    const rows = [Array.from({ length: 41 }, () => "x")];
    expect(importRequestSchema.safeParse({ ...request, rows }).success).toBe(
      false,
    );
  });

  it("rejects mapping two fields to the same column target", () => {
    const mapping = [
      { index: 0, field: "name" as const },
      { index: 1, field: "name" as const },
    ];
    expect(importRequestSchema.safeParse({ ...request, mapping }).success).toBe(
      false,
    );
  });
});

describe("mapping rows", () => {
  it("keeps the file's row numbers", () => {
    const mapped = mapRows(
      [
        ["Coffee", "CAF-001"],
        ["Tea", "CAF-002"],
      ],
      [
        { index: 0, field: "name" },
        { index: 1, field: "sku" },
      ],
      2,
    );
    expect(mapped.map((row) => row.rowNumber)).toEqual([2, 3]);
    expect(mapped[1]?.source).toEqual({ name: "Tea", sku: "CAF-002" });
  });
});
