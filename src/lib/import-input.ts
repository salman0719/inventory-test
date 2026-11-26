import { z } from "zod";
import { MONEY_PATTERN, QUANTITY_PATTERN, SKU_PATTERN } from "./product-input";

/**
 * The product CSV import contract.
 *
 * Three jobs live here, all server-safe and unit-tested:
 *
 * 1. Describe the columns once, so the template, the mapping UI and the export
 *    cannot drift.
 * 2. Turn spreadsheet text into the same values the product form accepts, without
 *    guessing a locale: a comma decimal is refused, never reinterpreted.
 * 3. Evaluate every row against the catalogue before anything is written, so the
 *    review screen and the database function agree on what is valid.
 *
 * Nothing here reads the database. The caller supplies existing SKUs, supplier
 * names and category names; this module only decides.
 */

export const IMPORT_LIMITS = {
  rows: 500,
  columns: 40,
  bytes: 1_000_000,
  cell: 2_000,
} as const;

export const IMPORT_FIELD_KEYS = [
  "name",
  "sku",
  "barcode",
  "category",
  "supplier",
  "supplierSku",
  "unit",
  "costPrice",
  "sellingPrice",
  "reorderLevel",
  "targetStockLevel",
  "opening",
  "description",
] as const;

export type ImportField = (typeof IMPORT_FIELD_KEYS)[number];

type FieldDefinition = {
  key: ImportField;
  label: string;
  required: boolean;
  aliases: readonly string[];
  example: string;
  help: string;
};

/**
 * Header aliases are deliberately a finite list. A value-shape guess is a
 * proposal the operator accepts in the mapping table; an alias is deterministic.
 */
export const IMPORT_FIELDS: readonly FieldDefinition[] = [
  {
    key: "name",
    label: "Product name",
    required: true,
    aliases: ["product", "item", "item name", "name"],
    example: "House blend 1kg",
    help: "1–120 characters.",
  },
  {
    key: "sku",
    label: "SKU",
    required: true,
    aliases: ["code", "item code", "product code", "our ref", "ref"],
    example: "CAF-001",
    help: "Letters, numbers, dots, dashes or underscores. Leading zeros are kept.",
  },
  {
    key: "barcode",
    label: "Barcode",
    required: false,
    aliases: ["ean", "upc", "gtin", "product barcode"],
    example: "",
    help: "Optional; text, so leading zeros are kept.",
  },
  {
    key: "category",
    label: "Category",
    required: false,
    aliases: ["type", "group", "department", "product type"],
    example: "Coffee",
    help: "Matched by name. A new name can be created.",
  },
  {
    key: "supplier",
    label: "Supplier",
    required: false,
    aliases: ["vendor", "supplier name", "brand"],
    example: "Polar Line Frozen",
    help: "Matched by name. Blank uses the supplier chosen for the file.",
  },
  {
    key: "supplierSku",
    label: "Supplier SKU",
    required: false,
    aliases: ["supplier code", "vendor code", "order code", "supplier ref"],
    example: "PFD-100",
    help: "The supplier's own code for this product.",
  },
  {
    key: "unit",
    label: "Unit",
    required: false,
    aliases: ["uom", "unit of measure", "pack unit", "measure"],
    example: "ea",
    help: "Defaults to ea.",
  },
  {
    key: "costPrice",
    label: "Cost price",
    required: false,
    aliases: [
      "cost",
      "trade price",
      "buy price",
      "purchase price",
      "unit cost",
    ],
    example: "18.50",
    help: "Defaults to 0. A leading $ and thousands commas are accepted.",
  },
  {
    key: "sellingPrice",
    label: "Selling price",
    required: false,
    aliases: ["price", "sell price", "retail price", "rrp"],
    example: "32.00",
    help: "Optional.",
  },
  {
    key: "reorderLevel",
    label: "Reorder level",
    required: false,
    aliases: ["reorder", "min stock", "minimum stock", "par level"],
    example: "4",
    help: "Defaults to 0.",
  },
  {
    key: "targetStockLevel",
    label: "Target stock",
    required: false,
    aliases: ["target", "max stock", "maximum stock", "par"],
    example: "8",
    help: "Optional; reorder suggestions fall back to twice the reorder level.",
  },
  {
    key: "opening",
    label: "Opening stock",
    required: false,
    aliases: [
      "opening",
      "opening balance",
      "stock on hand",
      "on hand",
      "qty on hand",
    ],
    example: "12",
    help: "New products only. Existing SKUs cannot have their stock overwritten.",
  },
  {
    key: "description",
    label: "Description",
    required: false,
    aliases: ["notes", "details", "product description"],
    example: "Single origin, roasted weekly",
    help: "Optional; up to 2,000 characters.",
  },
];

export const IMPORT_FIELD_LABELS: Record<ImportField, string> =
  Object.fromEntries(
    IMPORT_FIELDS.map((field) => [field.key, field.label]),
  ) as Record<ImportField, string>;

export const PRODUCT_TEMPLATE_HEADERS = IMPORT_FIELDS.map(
  (field) => field.label,
);

const PRODUCT_TEMPLATE_EXAMPLE = [
  "House blend 1kg",
  "CAF-001",
  "",
  "Coffee",
  "Polar Line Frozen",
  "PFD-100",
  "ea",
  "18.50",
  "32.00",
  "4",
  "8",
  "12",
  "Single origin, roasted weekly",
];

/** The template uses the labels, so a downloaded file maps with no intervention. */
export function productTemplateRows(): string[][] {
  return [
    PRODUCT_TEMPLATE_HEADERS,
    PRODUCT_TEMPLATE_HEADERS.map(
      (_, index) => PRODUCT_TEMPLATE_EXAMPLE[index] ?? "",
    ),
  ];
}

/** Header text as compared: case, punctuation and a leading currency mark ignored. */
export function normaliseHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/^'/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const FIELD_ALIASES = IMPORT_FIELDS.flatMap((field) =>
  field.aliases.map((alias) => ({
    alias: normaliseHeader(alias),
    field: field.key,
  })),
);

export type ColumnMatch = {
  index: number;
  field: ImportField | null;
  /** Why the field was chosen, so the UI can label it honestly. */
  source: "header" | "alias" | null;
};

/** Header rows are offered from the first five records, matching the picker. */
export const HEADER_ROW_LIMIT = 5;

export type HeaderSuggestion = {
  rowNumber: number;
  mapping: ColumnMatch[];
  /** Internal ordering score; not shown to the operator. */
  score: number;
};

/**
 * Deterministic mapping: exact label/key first, then the alias table. Each target
 * is used once, so two columns never claim the same field.
 *
 * `Description` is the one genuinely ambiguous header. It is the form's label, so
 * it maps to description; but a file whose only text column is `Description` is
 * using it as the product name, so it moves there when no name column exists.
 */
export function mapHeaders(headers: readonly string[]): ColumnMatch[] {
  const used = new Set<ImportField>();
  const result: ColumnMatch[] = headers.map((header, index) => {
    const normal = normaliseHeader(header);
    if (normal === "") return { index, field: null, source: null };

    const exact = IMPORT_FIELDS.find(
      (field) =>
        !used.has(field.key) &&
        (normaliseHeader(field.label) === normal ||
          field.key.toLowerCase() === normal),
    );
    if (exact) {
      used.add(exact.key);
      return { index, field: exact.key, source: "header" };
    }

    const alias = FIELD_ALIASES.find(
      (entry) => !used.has(entry.field) && entry.alias === normal,
    );
    if (alias) {
      used.add(alias.field);
      return { index, field: alias.field, source: "alias" };
    }

    return { index, field: null, source: null };
  });

  const description = result.find((match) => match.field === "description");
  const hasName = result.some((match) => match.field === "name");
  if (
    description &&
    !hasName &&
    normaliseHeader(headers[description.index] ?? "") === "description"
  ) {
    description.field = "name";
    description.source = "alias";
  }

  return result;
}

/**
 * Suggest the row that looks most like column names.
 *
 * This is deliberately a proposal, not a parse decision. A row must map both
 * required fields before it can win; exact labels score above aliases, a full-width
 * row scores above a one-cell title, and mapped columns that contain data below the
 * candidate score above an empty shell. The operator still sees the picker and can
 * choose any other row.
 */
export function suggestHeaderRow(
  rows: readonly (readonly string[])[],
  limit = HEADER_ROW_LIMIT,
): HeaderSuggestion | null {
  const candidateCount = Math.min(limit, rows.length - 1);
  if (candidateCount < 1) return null;

  const maxColumns = rows.reduce(
    (widest, row) => Math.max(widest, row.length),
    1,
  );
  let best: HeaderSuggestion | null = null;

  for (let index = 0; index < candidateCount; index += 1) {
    const row = rows[index] ?? [];
    const mapping = mapHeaders(row);
    const fields = new Set(
      mapping
        .map((match) => match.field)
        .filter((field): field is ImportField => field !== null),
    );
    if (!fields.has("name") || !fields.has("sku")) continue;

    const nonEmpty = row.filter(
      (cell) => normaliseCell(cell ?? "") !== "",
    ).length;
    if (nonEmpty < 2) continue;

    const exact = mapping.filter((match) => match.source === "header").length;
    const aliases = mapping.filter((match) => match.source === "alias").length;
    const following = rows.slice(index + 1, index + 6);
    const mappedColumns = mapping
      .filter((match) => match.field !== null)
      .map((match) => match.index);
    const populatedColumns = mappedColumns.filter((column) =>
      following.some((dataRow) => normaliseCell(dataRow[column] ?? "") !== ""),
    ).length;
    const dataCoverage =
      mappedColumns.length === 0 ? 0 : populatedColumns / mappedColumns.length;
    const score =
      exact * 4 +
      aliases * 3 +
      4 +
      (nonEmpty / maxColumns) * 4 +
      dataCoverage * 3;

    if (!best || score > best.score) {
      best = { rowNumber: index + 1, mapping, score };
    }
  }

  return best;
}

/** Up to three distinct non-empty values, for the mapping table's samples. */
export function sampleValues(
  rows: readonly (readonly string[])[],
  column: number,
  limit = 3,
): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = normaliseCell(row[column] ?? "");
    if (value === "" || seen.has(value)) continue;
    seen.add(value);
    if (seen.size === limit) break;
  }
  return [...seen];
}

export function normaliseCell(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/^'/, "")
    .trim();
}

export type CsvEncoding = "utf-8" | "utf-16le" | "utf-16be" | "windows-1252";

function startsWithBytes(
  bytes: Uint8Array,
  signature: readonly number[],
): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

/**
 * Decode a CSV file without silently replacing characters. UTF-8 is strict; an
 * invalid byte sequence is read as Windows-1252, the common Excel fallback, and
 * the caller shows which encoding was used. UTF-16 files with a BOM are decoded
 * as well. UTF-16 without a BOM remains unsupported rather than guessed.
 */
export function decodeCsvBytes(bytes: Uint8Array): {
  text: string;
  encoding: CsvEncoding;
} {
  if (startsWithBytes(bytes, [0xff, 0xfe])) {
    return {
      text: new TextDecoder("utf-16le").decode(bytes),
      encoding: "utf-16le",
    };
  }
  if (startsWithBytes(bytes, [0xfe, 0xff])) {
    return {
      text: new TextDecoder("utf-16be").decode(bytes),
      encoding: "utf-16be",
    };
  }

  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      encoding: "utf-8",
    };
  } catch {
    return {
      text: new TextDecoder("windows-1252").decode(bytes),
      encoding: "windows-1252",
    };
  }
}

/**
 * Papa's delimiter guess lowers the average field count when blank rows are
 * present, so the caller detects the delimiter on a blank-skipping pass and
 * reparses with it. This removes only the final line terminator's empty record:
 * interior blank rows stay so the evaluator can count them.
 */
export function trimTrailingBlankRows(
  rows: readonly (readonly string[])[],
): string[][] {
  let end = rows.length;
  while (end > 0) {
    const row = rows[end - 1];
    if (!row || !row.every((cell) => normaliseCell(cell) === "")) break;
    end -= 1;
  }
  return rows.slice(0, end).map((row) => row.map((cell) => String(cell ?? "")));
}

export type TextValue =
  { ok: true; value: string | null } | { ok: false; error: string };

/**
 * Money from a spreadsheet. `$4.50` and `1,234.56` are unambiguous; `1,5` is not,
 * so it is refused rather than guessed.
 */
export function parseMoneyText(raw: string, label: string): TextValue {
  let text = normaliseCell(raw).replace(/[\s\u00a0]/g, "");
  if (text === "") return { ok: true, value: null };

  text = text.replace(/^\$/, "");

  if (text.includes(",")) {
    // A grouped thousands figure is unambiguous and wins over the decimal-comma
    // refusal: "1,234.56" is a number, while "1,5" is a locale we do not guess.
    if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(text)) {
      text = text.replace(/,/g, "");
    } else if (/,\d{1,2}$/.test(text) && !text.includes(".")) {
      return {
        ok: false,
        error: `Use a full stop for decimals in ${label} (for example 1.50).`,
      };
    } else {
      return {
        ok: false,
        error: `Enter ${label} as an amount, for example 4.50.`,
      };
    }
  }

  if (!MONEY_PATTERN.test(text)) {
    return {
      ok: false,
      error: `Enter ${label} as an amount, for example 4.50.`,
    };
  }

  return { ok: true, value: text };
}

/** The same rules as the form's quantity fields, with thousands commas accepted. */
export function parseQuantityText(raw: string, label: string): TextValue {
  let text = normaliseCell(raw).replace(/[\s\u00a0]/g, "");
  if (text === "") return { ok: true, value: null };

  if (text.includes(",")) {
    if (/^\d{1,3}(,\d{3})+(\.\d{1,3})?$/.test(text)) {
      text = text.replace(/,/g, "");
    } else if (/,\d{1,2}$/.test(text) && !text.includes(".")) {
      return {
        ok: false,
        error: `Use a full stop for decimals in ${label} (for example 2.5).`,
      };
    } else {
      return {
        ok: false,
        error: `Enter ${label} as a number, for example 6 or 2.5.`,
      };
    }
  }

  if (!QUANTITY_PATTERN.test(text)) {
    return {
      ok: false,
      error: `Enter ${label} as a number, for example 6 or 2.5.`,
    };
  }

  return { ok: true, value: text };
}

export type ImportValues = {
  name: string;
  sku: string;
  barcode: string | null;
  category: string | null;
  supplier: string | null;
  supplierSku: string | null;
  unit: string;
  costPrice: string;
  sellingPrice: string | null;
  reorderLevel: string;
  targetStockLevel: string | null;
  opening: string;
  description: string | null;
};

/**
 * Validate and normalise one mapped row. Every error is collected so the review
 * can show the row's full problem rather than one message at a time.
 */
export function normaliseImportRow(
  source: Partial<Record<ImportField, string>>,
): { values: ImportValues | null; errors: string[] } {
  const errors: string[] = [];
  const text = (field: ImportField) => normaliseCell(source[field] ?? "");

  const name = text("name").replace(/\s+/g, " ");
  if (name === "") errors.push("Enter a product name.");
  else if (name.length > 120)
    errors.push("Keep the name to 120 characters or fewer.");

  const rawSku = text("sku");
  const sku = rawSku.toUpperCase();
  if (sku === "") errors.push("Enter a SKU.");
  else if (sku.length > 40)
    errors.push("Keep the SKU to 40 characters or fewer.");
  else if (!SKU_PATTERN.test(sku)) {
    errors.push(
      "Use letters, numbers, dots, dashes or underscores in the SKU.",
    );
  }

  const barcode = text("barcode");
  if (barcode.length > 80)
    errors.push("Keep the barcode to 80 characters or fewer.");

  const category = text("category");
  if (category.length > 120) {
    errors.push("Keep the category to 120 characters or fewer.");
  }

  const supplier = text("supplier");
  if (supplier.length > 120) {
    errors.push("Keep the supplier name to 120 characters or fewer.");
  }

  const supplierSku = text("supplierSku");
  if (supplierSku.length > 60) {
    errors.push("Keep the supplier SKU to 60 characters or fewer.");
  }

  const unit = text("unit") || "ea";
  if (unit.length > 12) errors.push("Keep the unit to 12 characters or fewer.");

  const cost = parseMoneyText(text("costPrice"), "the cost price");
  if (!cost.ok) errors.push(cost.error);
  const selling = parseMoneyText(text("sellingPrice"), "the selling price");
  if (!selling.ok) errors.push(selling.error);
  const reorder = parseQuantityText(text("reorderLevel"), "the reorder level");
  if (!reorder.ok) errors.push(reorder.error);
  const target = parseQuantityText(
    text("targetStockLevel"),
    "the target stock",
  );
  if (!target.ok) errors.push(target.error);
  const opening = parseQuantityText(text("opening"), "the opening stock");
  if (!opening.ok) errors.push(opening.error);
  if (opening.ok && opening.value !== null && Number(opening.value) < 0) {
    errors.push("The opening stock cannot be negative.");
  }

  const description = text("description");
  if (description.length > IMPORT_LIMITS.cell) {
    errors.push("Keep the description to 2000 characters or fewer.");
  }

  if (errors.length > 0) return { values: null, errors };

  return {
    values: {
      name,
      sku,
      barcode: barcode || null,
      category: category || null,
      supplier: supplier || null,
      supplierSku: supplierSku || null,
      unit,
      costPrice: cost.ok && cost.value !== null ? cost.value : "0",
      sellingPrice: selling.ok ? selling.value : null,
      reorderLevel: reorder.ok && reorder.value !== null ? reorder.value : "0",
      targetStockLevel: target.ok ? target.value : null,
      opening: opening.ok && opening.value !== null ? opening.value : "0",
      description: description || null,
    },
    errors: [],
  };
}

export type RowCandidate = {
  rowNumber: number;
  source: Partial<Record<ImportField, string>>;
};

/** One mapped row per CSV row, keeping the file's row number for messages. */
export function mapRows(
  rows: readonly (readonly string[])[],
  mapping: readonly { index: number; field: ImportField | null }[],
  rowOffset: number,
): RowCandidate[] {
  const columns = new Map<ImportField, number>();
  for (const entry of mapping) {
    if (entry.field !== null && !columns.has(entry.field)) {
      columns.set(entry.field, entry.index);
    }
  }

  return rows.map((row, index) => {
    const source: Partial<Record<ImportField, string>> = {};
    for (const [field, column] of columns) {
      source[field] = row[column] ?? "";
    }
    return { rowNumber: rowOffset + index, source };
  });
}

export const importOptionsSchema = z.object({
  updateExisting: z.boolean(),
  createSuppliers: z.boolean(),
  createCategories: z.boolean(),
  partial: z.boolean(),
});

export type ImportOptions = z.infer<typeof importOptionsSchema>;

export const importMappingSchema = z.object({
  index: z
    .number()
    .int()
    .min(0)
    .max(IMPORT_LIMITS.columns - 1),
  field: z.enum(IMPORT_FIELD_KEYS).nullable(),
});

/**
 * The payload preview and confirm both accept. The browser is allowed to send
 * rows, never derived totals: validity and counts are recomputed on the server.
 */
export const importRequestSchema = z
  .object({
    filename: z.string().trim().min(1).max(200),
    rowOffset: z.number().int().min(2).max(10),
    rows: z
      .array(
        z.array(z.string().max(IMPORT_LIMITS.cell)).max(IMPORT_LIMITS.columns),
      )
      .min(1)
      .max(IMPORT_LIMITS.rows),
    mapping: z.array(importMappingSchema).min(1).max(IMPORT_LIMITS.columns),
    defaultSupplierId: z.uuid().nullable(),
    options: importOptionsSchema,
    idempotencyKey: z.uuid(),
  })
  .superRefine((value, context) => {
    const fields = value.mapping
      .map((entry) => entry.field)
      .filter((field): field is ImportField => field !== null);
    if (new Set(fields).size !== fields.length) {
      context.addIssue({
        code: "custom",
        message: "Each product field can be mapped once.",
        path: ["mapping"],
      });
    }
  });

export type ImportRequest = z.infer<typeof importRequestSchema>;

export type ImportLookups = {
  /** Every SKU in the business, including archived products. */
  products: { id: string; sku: string; name: string }[];
  suppliers: string[];
  categories: string[];
};

export type EvaluatedRow = {
  rowNumber: number;
  name: string;
  sku: string;
  status: "new" | "update" | "error" | "skip";
  errors: string[];
  warnings: string[];
  values: ImportValues | null;
};

export type ImportEvaluation = {
  rows: EvaluatedRow[];
  counts: {
    totalRows: number;
    newRows: number;
    updateRows: number;
    skippedRows: number;
    errorRows: number;
    warningRows: number;
  };
  newCategories: string[];
  newSuppliers: string[];
  /** True when every non-blank row can be written without a partial import. */
  valid: boolean;
};

/**
 * Evaluate every mapped row against the catalogue snapshot read by the caller.
 *
 * The result is advisory: confirm re-runs this and the database function validates
 * again. It exists so the operator sees exactly what will happen, row by row.
 */
export function evaluateImport(input: {
  candidates: readonly RowCandidate[];
  options: ImportOptions;
  lookups: ImportLookups;
  defaultSupplierName: string | null;
}): ImportEvaluation {
  const productsBySku = new Map(
    input.lookups.products.map((product) => [
      product.sku.toUpperCase(),
      product,
    ]),
  );
  const supplierCounts = new Map<string, number>();
  for (const name of input.lookups.suppliers) {
    const key = name.toLowerCase();
    supplierCounts.set(key, (supplierCounts.get(key) ?? 0) + 1);
  }
  const categoryNames = new Set(
    input.lookups.categories.map((name) => name.toLowerCase()),
  );

  const rows: EvaluatedRow[] = [];
  const seenSkus = new Map<string, number>();
  const newCategories = new Set<string>();
  const newSuppliers = new Set<string>();

  for (const candidate of input.candidates) {
    const rawName = normaliseCell(candidate.source.name ?? "").replace(
      /\s+/g,
      " ",
    );
    const rawSku = normaliseCell(candidate.source.sku ?? "").toUpperCase();
    const isBlank = Object.values(candidate.source).every(
      (value) => normaliseCell(value ?? "") === "",
    );

    if (isBlank) {
      rows.push({
        rowNumber: candidate.rowNumber,
        name: "",
        sku: "",
        status: "skip",
        errors: [],
        warnings: [],
        values: null,
      });
      continue;
    }

    const { values, errors } = normaliseImportRow(candidate.source);
    const warnings: string[] = [];

    if (values === null) {
      rows.push({
        rowNumber: candidate.rowNumber,
        name: rawName,
        sku: rawSku,
        status: "error",
        errors,
        warnings,
        values: null,
      });
      continue;
    }

    const firstSeen = seenSkus.get(values.sku);
    if (firstSeen !== undefined) {
      rows.push({
        rowNumber: candidate.rowNumber,
        name: values.name,
        sku: values.sku,
        status: "error",
        errors: [
          `SKU ${values.sku} already appears on row ${firstSeen} of this file.`,
        ],
        warnings,
        values,
      });
      continue;
    }
    seenSkus.set(values.sku, candidate.rowNumber);

    const existing = productsBySku.get(values.sku);

    if (existing) {
      if (!input.options.updateExisting) {
        rows.push({
          rowNumber: candidate.rowNumber,
          name: values.name,
          sku: values.sku,
          status: "error",
          errors: [
            `SKU ${values.sku} is already in this business. Tick “Update existing products” to refresh it.`,
          ],
          warnings,
          values,
        });
        continue;
      }
      if (Number(values.opening) !== 0) {
        rows.push({
          rowNumber: candidate.rowNumber,
          name: values.name,
          sku: values.sku,
          status: "error",
          errors: [
            `SKU ${values.sku} already exists, so its opening stock cannot be set. Use a stock adjustment instead.`,
          ],
          warnings,
          values,
        });
        continue;
      }
      warnings.push(
        `SKU ${values.sku} exists; its catalogue fields will be updated.`,
      );
    }

    // Supplier: the row wins; the file's chosen supplier is the fallback.
    const supplierName = values.supplier ?? input.defaultSupplierName;
    if (supplierName === null) {
      rows.push({
        rowNumber: candidate.rowNumber,
        name: values.name,
        sku: values.sku,
        status: "error",
        errors: ["Choose a supplier for the file, or add a Supplier column."],
        warnings,
        values,
      });
      continue;
    }
    const supplierMatches = supplierCounts.get(supplierName.toLowerCase()) ?? 0;
    if (supplierMatches > 1) {
      rows.push({
        rowNumber: candidate.rowNumber,
        name: values.name,
        sku: values.sku,
        status: "error",
        errors: [
          `Two suppliers are called ${supplierName}. Rename one before importing.`,
        ],
        warnings,
        values,
      });
      continue;
    }
    if (supplierMatches === 0) {
      if (!input.options.createSuppliers) {
        rows.push({
          rowNumber: candidate.rowNumber,
          name: values.name,
          sku: values.sku,
          status: "error",
          errors: [
            `${supplierName} is not a supplier yet. Tick “Create missing suppliers” or add it first.`,
          ],
          warnings,
          values,
        });
        continue;
      }
      newSuppliers.add(supplierName);
      warnings.push(`Supplier ${supplierName} will be created.`);
    }

    const category = values.category;
    if (category !== null) {
      if (!categoryNames.has(category.toLowerCase())) {
        if (!input.options.createCategories) {
          rows.push({
            rowNumber: candidate.rowNumber,
            name: values.name,
            sku: values.sku,
            status: "error",
            errors: [
              `Category ${category} does not exist. Tick “Create missing categories” or add it first.`,
            ],
            warnings,
            values,
          });
          continue;
        }
        newCategories.add(category);
        warnings.push(`Category ${category} will be created.`);
      }
    }

    if (
      values.sellingPrice !== null &&
      Number(values.costPrice) > Number(values.sellingPrice)
    ) {
      warnings.push(
        "Cost is higher than the selling price. Check the two columns are not swapped.",
      );
    }

    rows.push({
      rowNumber: candidate.rowNumber,
      name: values.name,
      sku: values.sku,
      status: existing ? "update" : "new",
      errors: [],
      warnings,
      values,
    });
  }

  const counts = {
    totalRows: rows.length,
    newRows: rows.filter((row) => row.status === "new").length,
    updateRows: rows.filter((row) => row.status === "update").length,
    skippedRows: rows.filter((row) => row.status === "skip").length,
    errorRows: rows.filter((row) => row.status === "error").length,
    warningRows: rows.filter((row) => row.warnings.length > 0).length,
  };

  return {
    rows,
    counts,
    newCategories: [...newCategories].sort((a, b) => a.localeCompare(b)),
    newSuppliers: [...newSuppliers].sort((a, b) => a.localeCompare(b)),
    valid: counts.errorRows === 0,
  };
}

/** Rows that confirm may send: everything except errors and blank rows. */
export function importableRows(evaluation: ImportEvaluation): ImportValues[] {
  return evaluation.rows
    .filter((row) => row.status === "new" || row.status === "update")
    .map((row) => row.values)
    .filter((values): values is ImportValues => values !== null);
}
