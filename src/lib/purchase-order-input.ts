import { z } from "zod";

/**
 * Purchase order form validation and the status vocabulary the screens share.
 *
 * Quantities and money stay numeric strings so nothing rounds on the way to
 * Postgres. The business id is absent on purpose: it comes from the session, and
 * the status and received quantities are not fields at all — the database takes
 * those away from the application role.
 */

export const ORDER_STATUSES = [
  "draft",
  "ordered",
  "partially_received",
  "received",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_LABELS: Record<OrderStatus, string> = {
  draft: "Draft",
  ordered: "Ordered",
  partially_received: "Partly received",
  received: "Received",
  cancelled: "Cancelled",
};

/** Statuses that still owe stock, so the order can be received. */
export const AWAITING_STATUSES: OrderStatus[] = [
  "ordered",
  "partially_received",
];

export function canReceive(status: OrderStatus): boolean {
  return AWAITING_STATUSES.includes(status);
}

export type OrderFilter = "all" | "open" | OrderStatus;

export const ORDER_FILTERS: ReadonlyArray<{
  value: OrderFilter;
  label: string;
}> = [
  { value: "all", label: "All orders" },
  { value: "open", label: "Awaiting delivery" },
  { value: "draft", label: "Drafts" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Cancelled" },
];

export function parseOrderFilter(
  value: string | undefined | null,
): OrderFilter {
  if (value === "open") return "open";
  return ORDER_STATUSES.find((status) => status === value) ?? "all";
}

const QUANTITY_PATTERN = /^\d{1,9}(\.\d{1,3})?$/;
const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Rejects 2026-02-30, which Date.parse would quietly roll into March. */
function isCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

const lineSchema = z.object({
  productId: z
    .string()
    .trim()
    .refine(
      (value) => z.uuid().safeParse(value).success,
      "Choose a product for every line.",
    ),
  quantity: z
    .string()
    .trim()
    .regex(
      QUANTITY_PATTERN,
      "Enter the quantity as a number, for example 6 or 2.5.",
    )
    .refine((value) => Number(value) > 0, "Enter a quantity above zero."),
  unitCost: z
    .string()
    .trim()
    .regex(
      MONEY_PATTERN,
      "Enter the unit cost as an amount, for example 4.50.",
    ),
});

export const purchaseOrderInputSchema = z
  .object({
    supplierId: z
      .string()
      .trim()
      .refine(
        (value) => z.uuid().safeParse(value).success,
        "Choose a supplier.",
      ),
    /** A plain date in the URL and the form; empty means no expectation yet. */
    expectedDeliveryAt: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || isCalendarDate(value),
        "Enter the expected delivery as a date.",
      )
      .transform((value) => (value === "" ? null : value)),
    notes: z
      .string()
      .trim()
      .max(2000, "Keep the notes to 2000 characters or fewer.")
      .transform((value) => (value === "" ? null : value)),
    lines: z
      .array(lineSchema)
      .min(1, "Add at least one line to the order.")
      .max(60, "Keep an order to 60 lines or fewer."),
  })
  .superRefine((value, context) => {
    // The table has a unique (order, product) index; catching it here gives the
    // operator a sentence instead of a constraint name.
    const seen = new Set<string>();
    value.lines.forEach((line, index) => {
      if (seen.has(line.productId)) {
        context.addIssue({
          code: "custom",
          path: ["lines", index, "productId"],
          message: "Each product can appear once. Combine the quantities.",
        });
      }
      seen.add(line.productId);
    });
  });

export type PurchaseOrderInput = z.infer<typeof purchaseOrderInputSchema>;

/** A quantity in a delivery split. Unlike an order quantity, zero is a real answer. */
function splitQuantity(label: string) {
  return z
    .string()
    .trim()
    .regex(
      QUANTITY_PATTERN,
      `Enter ${label} as a number, for example 6 or 2.5.`,
    );
}

/**
 * One line of a delivery, as the receiving form posts it.
 *
 * The operator gives the three parts; what arrived is their sum, computed here and
 * again in the database. The browser never gets to say how much stock it added.
 */
export const receiptLineSchema = z
  .object({
    lineId: z
      .string()
      .trim()
      .refine(
        (value) => z.uuid().safeParse(value).success,
        "Choose an order line to receive.",
      ),
    accepted: splitQuantity("what was accepted"),
    damaged: splitQuantity("what was damaged"),
    rejected: splitQuantity("what was rejected"),
    reason: z
      .string()
      .trim()
      .max(500, "Keep the note to 500 characters or fewer.")
      .transform((value) => (value === "" ? null : value)),
  })
  .superRefine((line, context) => {
    // A discrepancy without a sentence is the part nobody can act on later.
    if (
      Number(line.damaged) + Number(line.rejected) > 0 &&
      line.reason === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Say what was wrong with the delivery.",
      });
    }
  });

export const receiptSchema = z.object({
  orderId: z
    .string()
    .trim()
    .refine((value) => z.uuid().safeParse(value).success, "Open an order."),
  idempotencyKey: z
    .string()
    .trim()
    .refine(
      (value) => z.uuid().safeParse(value).success,
      "Reload the order and try again.",
    ),
  lines: z
    .array(receiptLineSchema)
    .min(1, "Enter a quantity for at least one line.")
    .max(60, "Receive 60 lines at a time at most."),
});

export type ReceiptInput = z.infer<typeof receiptSchema>;

/**
 * What arrived on a line: accepted + damaged + rejected.
 *
 * Added in thousandths because quantities carry three decimals, so 0.1 + 0.2 must
 * read as 0.3 rather than 0.30000000000000004.
 */
export function arrivedQuantity(line: {
  accepted: string;
  damaged: string;
  rejected: string;
}): string {
  const total =
    Math.round(Number(line.accepted) * 1000) +
    Math.round(Number(line.damaged) * 1000) +
    Math.round(Number(line.rejected) * 1000);
  return Number.isFinite(total) ? String(total / 1000) : "0";
}

/** A line where nothing arrived is an untouched row, not a delivery line. */
export function isEmptyDeliveryLine(line: {
  accepted: string;
  damaged: string;
  rejected: string;
}): boolean {
  return arrivedQuantity(line) === "0";
}

export const closeShortSchema = z.object({
  orderId: z
    .string()
    .trim()
    .refine((value) => z.uuid().safeParse(value).success, "Open an order."),
  reason: z
    .string()
    .trim()
    .min(1, "Say why the order is closing short.")
    .max(500, "Keep the note to 500 characters or fewer."),
});

export type CloseShortInput = z.infer<typeof closeShortSchema>;

/** "6.000" reads as "6" in an input; a stored quantity is not a form value. */
export function quantityField(value: string | number): string {
  const quantity = Number(value);
  return Number.isFinite(quantity) ? String(quantity) : String(value);
}

/**
 * Today plus a supplier's calendar lead time, as the form's `yyyy-mm-dd` value.
 * Null when no lead time is recorded, so the field stays the operator's to fill.
 */
export function suggestedDeliveryDate(
  leadTimeDays: number | null,
  from: Date = new Date(),
): string | null {
  if (leadTimeDays === null) return null;
  // Local parts, not toISOString: a UTC conversion can move the date by a day.
  const date = new Date(
    from.getFullYear(),
    from.getMonth(),
    from.getDate() + leadTimeDays,
  );
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** What is still owed on a line: ordered minus received, never below zero. */
export function outstandingQuantity(
  ordered: string | number,
  received: string | number,
): number {
  const difference = Number(ordered) - Number(received);
  if (!Number.isFinite(difference) || difference <= 0) return 0;
  return Math.round(difference * 1000) / 1000;
}
