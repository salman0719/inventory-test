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

const SKU_PATTERN = /^[A-Za-z0-9._-]+$/;
const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;
const QUANTITY_PATTERN = /^\d{1,9}(\.\d{1,3})?$/;

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
  supplierId: optionalUuid("supplier"),
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
  description: z
    .string()
    .trim()
    .max(2000, "Keep the description to 2000 characters or fewer.")
    .transform((value) => (value === "" ? null : value)),
});

export type ProductInput = z.infer<typeof productInputSchema>;

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
