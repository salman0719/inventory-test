import { z } from "zod";
import { formatQuantity } from "./product-input";

/**
 * Stock movement form validation and the vocabulary the inventory screens use.
 *
 * Quantities are numeric strings, never floats: the delta is signed here as text so
 * nothing rounds on the way to Postgres. The business id is absent on purpose — it
 * comes from the session, and the database function re-derives it from the product.
 */

export const MOVEMENT_TYPES = ["stock_in", "stock_out", "adjustment"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  stock_in: "Stock in",
  stock_out: "Stock out",
  adjustment: "Adjustment",
};

export type MovementDirection = "in" | "out";

/** URL values for the stock filter. Anything else means "all". */
export const STOCK_FILTERS = ["out", "low", "ok"] as const;
export type StockFilter = "all" | (typeof STOCK_FILTERS)[number];

export function parseStockFilter(
  value: string | undefined | null,
): StockFilter {
  return STOCK_FILTERS.find((filter) => filter === value) ?? "all";
}

export const STOCK_SORTS = ["name", "low", "high"] as const;
export type StockSort = (typeof STOCK_SORTS)[number];

export function parseStockSort(value: string | undefined | null): StockSort {
  return STOCK_SORTS.find((sort) => sort === value) ?? "name";
}

const QUANTITY_PATTERN = /^\d{1,9}(\.\d{1,3})?$/;

export const stockMovementSchema = z
  .object({
    productId: z
      .string()
      .trim()
      .refine(
        (value) => z.uuid().safeParse(value).success,
        "Open a product before recording stock.",
      ),
    movementType: z.enum(MOVEMENT_TYPES),
    /** Only an adjustment has a direction; stock in and stock out imply it. */
    direction: z.enum(["in", "out"]).optional(),
    quantity: z
      .string()
      .trim()
      .regex(
        QUANTITY_PATTERN,
        "Enter the quantity as a number, for example 6 or 2.5.",
      )
      .refine((value) => Number(value) > 0, "Enter a quantity above zero."),
    reason: z
      .string()
      .trim()
      .max(200, "Keep the reason to 200 characters or fewer."),
  })
  .superRefine((value, context) => {
    if (value.movementType !== "adjustment") return;

    if (!value.direction) {
      context.addIssue({
        code: "custom",
        path: ["direction"],
        message: "Choose whether the adjustment adds or removes stock.",
      });
    }
    if (value.reason.length < 3) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Give a reason for the adjustment.",
      });
    }
  });

export type StockMovementInput = z.infer<typeof stockMovementSchema>;

/** The signed delta the ledger stores: stock out always removes, in always adds. */
export function signedQuantity(
  movementType: MovementType,
  direction: MovementDirection | undefined,
  quantity: string,
): string {
  const negative =
    movementType === "stock_out" ||
    (movementType === "adjustment" && direction === "out");
  return negative ? `-${quantity}` : quantity;
}

/** "+12", "-2.5": the sign is the point of a ledger line, so it is never hidden. */
export function formatSignedQuantity(value: string | number | null): string {
  if (value === null || value === "") return "—";
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity === 0) return "—";
  const sign = quantity > 0 ? "+" : "-";
  return `${sign}${formatQuantity(Math.abs(quantity))}`;
}
