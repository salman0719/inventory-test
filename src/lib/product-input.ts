import { z } from "zod";

/**
 * Product form validation, shared by the server action and the unit tests.
 *
 * Every value arrives as a string from FormData, and the database stores money and
 * quantities as numeric, so the schema returns numeric strings rather than floats:
 * nothing rounds on the way to Postgres.
 *
 * The business id is deliberately absent. It comes from the session, never from
 * the form, so a crafted request cannot write into another tenant.
 */

/** Sort keys exposed in the URL. Anything else falls back to name order. */
export const PRODUCT_SORTS = [
  "name",
  "sku",
  "cost",
  "onhand",
  "updated",
] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export function parseProductSort(
  value: string | undefined | null,
): ProductSort {
  return PRODUCT_SORTS.find((sort) => sort === value) ?? "name";
}

// Exported so the CSV import validates the same shapes as the form: a limit
// changed here applies to both, instead of drifting in a second copy.
export const SKU_PATTERN = /^[A-Za-z0-9._-]+$/;
export const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;
export const QUANTITY_PATTERN = /^\d{1,9}(\.\d{1,3})?$/;

/** A select whose empty option means "none", not "invalid". */
function optionalUuid(label: string) {
  return z
    .string()
    .trim()
    .refine(
      (value) => value === "" || z.uuid().safeParse(value).success,
      `Choose a ${label} from the list.`,
    )
    .transform((value) => (value === "" ? null : value));
}

const supplierCodeSchema = z
  .string()
  .trim()
  .max(60, "Keep the supplier code to 60 characters or fewer.")
  .transform((value) => (value === "" ? null : value));

/** A link's lead time, or blank to use the supplier's own figure. */
const optionalLeadTimeSchema = z
  .string()
  .trim()
  .refine(
    (value) =>
      value === "" || (/^\d{1,3}$/.test(value) && Number(value) <= 365),
    "Enter a lead time from 0 to 365 days, or leave it blank.",
  )
  .transform((value) => (value === "" ? null : Number(value)));

function optionalMoney(label: string) {
  return z
    .string()
    .trim()
    .refine(
      (value) => value === "" || MONEY_PATTERN.test(value),
      `Enter ${label} as an amount, for example 4.50.`,
    )
    .transform((value) => (value === "" ? null : value));
}

export const productInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a product name.")
    .max(120, "Keep the name to 120 characters or fewer."),
  /** The manufacturer barcode scanned at the shelf; free text, often digits. */
  barcode: z
    .string()
    .trim()
    .max(80, "Keep the barcode to 80 characters or fewer.")
    .default("")
    .transform((value) => (value === "" ? null : value)),
  sku: z
    .string()
    .trim()
    .min(1, "Enter a SKU.")
    .max(40, "Keep the SKU to 40 characters or fewer.")
    .regex(
      SKU_PATTERN,
      "Use letters, numbers, dots, dashes or underscores in the SKU.",
    )
    .transform((value) => value.toUpperCase()),
  categoryId: optionalUuid("category"),
  /** The default supplier. A product without one is refused by this form. */
  supplierId: z
    .string()
    .trim()
    .refine(
      (value) => z.uuid().safeParse(value).success,
      "Choose a supplier for this product.",
    ),
  /** The default supplier's own catalogue code; free text, often a slash. */
  supplierSku: supplierCodeSchema,
  unitOfMeasure: z
    .string()
    .trim()
    .min(1, "Enter a unit, for example kg or ea.")
    .max(12, "Keep the unit to 12 characters or fewer."),
  costPrice: z
    .string()
    .trim()
    .regex(
      MONEY_PATTERN,
      "Enter the cost price as an amount, for example 4.50.",
    ),
  sellingPrice: optionalMoney("the selling price"),
  reorderLevel: z
    .string()
    .trim()
    .regex(
      QUANTITY_PATTERN,
      "Enter the reorder level as a number, for example 6 or 2.5.",
    ),
  /** Blank means the reorder screen doubles the reorder level instead. */
  targetStockLevel: z
    .string()
    .trim()
    .default("")
    .refine(
      (value) => value === "" || QUANTITY_PATTERN.test(value),
      "Enter the target stock as a number, for example 12 or 2.5.",
    )
    .transform((value) => (value === "" ? null : value)),
  description: z
    .string()
    .trim()
    .max(2000, "Keep the description to 2000 characters or fewer.")
    .transform((value) => (value === "" ? null : value)),
});

export type ProductInput = z.infer<typeof productInputSchema>;

/** A second supplier added from the product panel. */
export const productSupplierLinkInputSchema = z.object({
  productId: z.uuid(),
  supplierId: z.uuid(),
  supplierSku: supplierCodeSchema,
  leadTimeDays: optionalLeadTimeSchema,
});

export type ProductSupplierLinkInput = z.infer<
  typeof productSupplierLinkInputSchema
>;

/** Make-default and remove actions: the link must belong to the product. */
export const productSupplierLinkRefSchema = z.object({
  productId: z.uuid(),
  linkId: z.uuid(),
});

export type ProductSupplierLinkRef = z.infer<
  typeof productSupplierLinkRefSchema
>;

/**
 * Stock state for the table. On-hand is derived from the ledger, so this reads a
 * number, never a stored flag: zero or below is out, at or under the reorder level
 * is low.
 */
export type StockStatus = "ok" | "low" | "out";

export function stockStatus(
  onHand: string | number,
  reorderLevel: string | number,
): StockStatus {
  const quantity = Number(onHand);
  const reorder = Number(reorderLevel);
  if (!Number.isFinite(quantity) || quantity <= 0) return "out";
  if (Number.isFinite(reorder) && reorder > 0 && quantity <= reorder) {
    return "low";
  }
  return "ok";
}

/** "18.000" reads as "18"; "2.500" as "2.5". Trailing zeros are noise here. */
export function formatQuantity(value: string | number | null): string {
  if (value === null || value === "") return "—";
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return "—";
  return quantity.toLocaleString("en-AU", { maximumFractionDigits: 3 });
}

export function formatMoney(
  value: string | number | null,
  currency: string,
): string {
  if (value === null || value === "") return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(amount);
}
