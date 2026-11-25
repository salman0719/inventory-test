import { z } from "zod";

/**
 * Stocktake form validation.
 *
 * The browser sends line ids and the counted text; nothing else. The business and
 * the actor come from the session, and the delta is computed by the database from
 * the live ledger, so a stale count sheet can never state its own correction.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Blank is "not counted"; anything else is a non-negative quantity. */
const COUNT_PATTERN = /^\d{1,9}(\.\d{1,3})?$/;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** The filters that build a sheet. Empty means every active product. */
export const stocktakeScopeSchema = z.object({
  categoryId: z
    .string()
    .trim()
    .max(36)
    .default("")
    .refine(
      (value) => value === "" || isUuid(value),
      "Choose a category from the list.",
    ),
  search: z
    .string()
    .trim()
    .max(80, "Keep the search to 80 characters or fewer.")
    .default(""),
});

export type StocktakeScopeInput = z.infer<typeof stocktakeScopeSchema>;

export const stocktakeCountSchema = z
  .object({
    sessionId: z
      .string()
      .trim()
      .refine(isUuid, "Open a stocktake before saving counts."),
    intent: z.enum(["save", "complete"]),
    lines: z
      .array(
        z.object({
          lineId: z
            .string()
            .trim()
            .refine(isUuid, "A count sheet line is missing its id."),
          counted: z
            .string()
            .trim()
            .max(14, "Enter the counted quantity as a number."),
        }),
      )
      .max(500, "A stocktake can hold at most 500 products."),
  })
  .superRefine((value, context) => {
    const seen = new Set<string>();
    let counted = 0;

    value.lines.forEach((line, index) => {
      if (seen.has(line.lineId)) {
        context.addIssue({
          code: "custom",
          path: ["lines", index, "lineId"],
          message: "Each product appears once on a stocktake.",
        });
      }
      seen.add(line.lineId);

      if (line.counted === "") return;

      if (!COUNT_PATTERN.test(line.counted)) {
        context.addIssue({
          code: "custom",
          path: ["lines", index, "counted"],
          message:
            "Enter the counted quantity as a number, for example 6 or 2.5.",
        });
        return;
      }

      counted += 1;
    });

    if (value.intent === "complete" && counted === 0) {
      context.addIssue({
        code: "custom",
        path: ["lines"],
        message: "Count at least one product before completing the stocktake.",
      });
    }
  });

export type StocktakeCountInput = z.infer<typeof stocktakeCountSchema>;

/** A display value for a status, shared by the list and the sheet. */
export const STOCKTAKE_STATUS_LABELS = {
  draft: "Counting",
  completed: "Completed",
  cancelled: "Cancelled",
} as const;

export type StocktakeStatus = keyof typeof STOCKTAKE_STATUS_LABELS;
