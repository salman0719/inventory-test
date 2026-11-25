import { z } from "zod";

/**
 * Reorder suggestions: the formula and the selection a screen may submit.
 *
 * The formula lives here as one function so the screen, the tests and the server
 * cannot disagree about what "suggested" means. It is deliberately not a forecast:
 * target stock is a policy figure, and on-order is subtracted because ordering the
 * same goods twice is the real failure, not because demand was predicted.
 */

const QUANTITY_PATTERN = /^\d{1,9}(\.\d{1,3})?$/;

function uuidField(message: string) {
  return z
    .string()
    .trim()
    .refine((value) => z.uuid().safeParse(value).success, message);
}

const reorderLineSchema = z.object({
  productId: uuidField("Choose a product to reorder."),
  quantity: z
    .string()
    .trim()
    .regex(
      QUANTITY_PATTERN,
      "Enter the quantity as a number, for example 6 or 2.5.",
    )
    .refine((value) => Number(value) > 0, "Enter a quantity above zero."),
});

export const reorderSelectionSchema = z
  .object({
    supplierId: uuidField("Choose a supplier."),
    lines: z
      .array(reorderLineSchema)
      .min(1, "Select at least one product.")
      .max(60, "Create 60 lines at a time at most."),
  })
  .superRefine((value, context) => {
    // The draft has a unique (order, product) index. Catching it here gives the
    // operator a sentence rather than a constraint name.
    const seen = new Set<string>();
    value.lines.forEach((line, index) => {
      if (seen.has(line.productId)) {
        context.addIssue({
          code: "custom",
          path: ["lines", index, "productId"],
          message: "Each product can appear once.",
        });
      }
      seen.add(line.productId);
    });
  });

export type ReorderSelection = z.infer<typeof reorderSelectionSchema>;

export type ReorderTarget = {
  /** The figure suggestions aim for, as a numeric string. */
  quantity: string;
  /** "set" when target_stock_level is stored, "fallback" when it is doubled. */
  source: "set" | "fallback";
};

/** Thousandths, because quantities carry three decimals and 0.1 + 0.2 is not 0.3. */
function units(value: string | number): number {
  const quantity = Number(value);
  return Number.isFinite(quantity) ? Math.round(quantity * 1000) : 0;
}

function fromUnits(value: number): string {
  return String(value / 1000);
}

/**
 * The level to aim for. A stored target always wins, including zero; only a null
 * target falls back to twice the reorder level, computed now rather than stored, so
 * changing the reorder level moves the target with it.
 */
export function reorderTarget(
  targetStockLevel: string | number | null,
  reorderLevel: string | number,
): ReorderTarget {
  if (targetStockLevel !== null) {
    return { quantity: fromUnits(units(targetStockLevel)), source: "set" };
  }
  return { quantity: fromUnits(units(reorderLevel) * 2), source: "fallback" };
}

/**
 * `max(0, target − on hand − on order)`.
 *
 * On-order is the caller's figure and must already exclude drafts: an unsent draft
 * has not been promised to the supplier, so it must not suppress a suggestion.
 */
export function suggestedReorderQuantity(input: {
  targetStockLevel: string | number | null;
  reorderLevel: string | number;
  onHand: string | number;
  onOrder: string | number;
}): string {
  const target = units(
    reorderTarget(input.targetStockLevel, input.reorderLevel).quantity,
  );
  const remaining = target - units(input.onHand) - units(input.onOrder);
  return fromUnits(Math.max(0, remaining));
}
