import { describe, expect, it } from "vitest";
import {
  evaluateSupplierImport,
  mapSupplierHeaders,
  normaliseSupplierRow,
  suggestSupplierHeaderRow,
  supplierImportRequestSchema,
  supplierTemplateRows,
  type SupplierRowCandidate,
} from "../../src/lib/import-input";

function candidate(
  rowNumber: number,
  source: SupplierRowCandidate["source"],
): SupplierRowCandidate {
  return { rowNumber, source };
}

const lookups = {
  suppliers: ["Polar Line Frozen"],
  archivedSuppliers: ["Old Supplier"],
};

describe("supplier header mapping", () => {
  it("maps the template headers with no intervention", () => {
    const mapped = mapSupplierHeaders(supplierTemplateRows()[0] ?? []);
    expect(mapped.map((entry) => entry.field)).toEqual([
      "name",
      "contactName",
      "email",
      "phone",
      "address",
      "leadTimeDays",
      "notes",
    ]);
    expect(mapped.every((entry) => entry.source === "header")).toBe(true);
  });

  it("maps the aliases a real supplier list uses", () => {
    const mapped = mapSupplierHeaders([
      "Vendor",
      "Contact Name",
      "E-mail",
      "Telephone",
      "Delivery days",
      "Comments",
    ]);
    expect(mapped.map((entry) => entry.field)).toEqual([
      "name",
      "contactName",
      "email",
      "phone",
      "leadTimeDays",
      "notes",
    ]);
    expect(mapped.every((entry) => entry.source === "alias")).toBe(true);
  });

  it("leaves a Terms column unmapped rather than guessing", () => {
    const mapped = mapSupplierHeaders(["Supplier name", "Terms", "Notes"]);
    expect(mapped.map((entry) => entry.field)).toEqual(["name", null, "notes"]);
  });

  it("uses one field per column", () => {
    const mapped = mapSupplierHeaders(["Supplier", "Vendor", "Email"]);
    expect(mapped[0]?.field).toBe("name");
    expect(mapped[1]?.field).toBeNull();
  });

  it("suggests a header below a title row", () => {
    const suggestion = suggestSupplierHeaderRow([
      ["Supplier list — updated 12 Nov 2026"],
      ["Supplier name", "Contact", "Email", "Lead time (days)", "Notes"],
      ["Paper Co", "Sam Reid", "orders@paper.example", "2", ""],
    ]);
    expect(suggestion?.rowNumber).toBe(2);
  });
});

describe("supplier row normalisation", () => {
  it("accepts a name alone and nulls every blank field", () => {
    const result = normaliseSupplierRow({ name: "  Paper  Co  " });
    expect(result.errors).toEqual([]);
    expect(result.values).toEqual({
      name: "Paper Co",
      contactName: null,
      email: null,
      phone: null,
      address: null,
      leadTimeDays: null,
      notes: null,
    });
  });

  it("refuses a malformed email and a non-numeric lead time", () => {
    const result = normaliseSupplierRow({
      name: "Roast Lab",
      email: "nina(at)roastlab.example",
      leadTimeDays: "two weeks",
    });
    expect(result.values).toBeNull();
    expect(result.errors).toHaveLength(2);
  });

  it("keeps the phone as text so leading zeros survive", () => {
    const result = normaliseSupplierRow({
      name: "Paper Co",
      phone: "02 5550 9911",
      leadTimeDays: "0",
    });
    expect(result.values?.phone).toBe("02 5550 9911");
    expect(result.values?.leadTimeDays).toBe(0);
  });
});

describe("supplier review", () => {
  it("marks a new supplier with warnings for missing email and lead time", () => {
    const evaluation = evaluateSupplierImport({
      candidates: [candidate(2, { name: "Paper Co" })],
      updateExisting: false,
      lookups,
    });
    expect(evaluation.counts.newRows).toBe(1);
    expect(evaluation.valid).toBe(true);
    expect(evaluation.rows[0]?.warnings).toHaveLength(2);
  });

  it("refuses an existing name unless updating", () => {
    const refused = evaluateSupplierImport({
      candidates: [candidate(2, { name: "polar line frozen" })],
      updateExisting: false,
      lookups,
    });
    expect(refused.rows[0]?.status).toBe("error");
    expect(refused.rows[0]?.errors[0]).toContain("already a supplier");

    const updated = evaluateSupplierImport({
      candidates: [candidate(2, { name: "polar line frozen" })],
      updateExisting: true,
      lookups,
    });
    expect(updated.rows[0]?.status).toBe("update");
    expect(updated.rows[0]?.warnings[0]).toContain("blank fields");
  });

  it("refuses a name repeated inside the file", () => {
    const evaluation = evaluateSupplierImport({
      candidates: [
        candidate(2, { name: "Paper Co" }),
        candidate(3, { name: "paper  co" }),
      ],
      updateExisting: false,
      lookups,
    });
    expect(evaluation.rows[1]?.status).toBe("error");
    expect(evaluation.rows[1]?.errors[0]).toContain("row 2");
  });

  it("refuses an archived supplier rather than resurrecting it", () => {
    const evaluation = evaluateSupplierImport({
      candidates: [candidate(2, { name: "Old Supplier" })],
      updateExisting: true,
      lookups,
    });
    expect(evaluation.rows[0]?.status).toBe("error");
    expect(evaluation.rows[0]?.errors[0]).toContain("archived");
  });

  it("counts blank rows as skipped, not imported", () => {
    const evaluation = evaluateSupplierImport({
      candidates: [
        candidate(2, { name: "" }),
        candidate(3, { name: "Paper Co" }),
      ],
      updateExisting: false,
      lookups,
    });
    expect(evaluation.counts.skippedRows).toBe(1);
    expect(evaluation.counts.newRows).toBe(1);
    expect(evaluation.counts.totalRows).toBe(2);
  });
});

describe("supplier import payload", () => {
  const base = {
    filename: "suppliers.csv",
    rowOffset: 2,
    rows: [["Paper Co", "Sam Reid"]],
    mapping: [
      { index: 0, field: "name" as const },
      { index: 1, field: "contactName" as const },
    ],
    updateExisting: false,
    partial: false,
    idempotencyKey: "3f2d9e10-0000-4000-8000-000000000001",
  };

  it("accepts a mapped supplier file", () => {
    expect(supplierImportRequestSchema.safeParse(base).success).toBe(true);
  });

  it("refuses two columns mapped to the same field", () => {
    const result = supplierImportRequestSchema.safeParse({
      ...base,
      mapping: [
        { index: 0, field: "name" },
        { index: 1, field: "name" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("refuses a header row outside the parser's range", () => {
    expect(
      supplierImportRequestSchema.safeParse({ ...base, rowOffset: 1 }).success,
    ).toBe(false);
  });
});
