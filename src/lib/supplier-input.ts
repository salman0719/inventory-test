import { z } from "zod";

/**
 * Supplier form validation.
 *
 * Name is the only required field: a supplier is often just a business name at the
 * moment an order is owed to it, and demanding a contact before one is known would
 * push operators to type junk. Optional fields become null, never empty strings.
 */
function optional(max: number, message: string) {
  return z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => (value === "" ? null : value));
}

export const supplierInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a supplier name.")
    .max(120, "Keep the name to 120 characters or fewer."),
  contactName: optional(80, "Keep the contact name to 80 characters or fewer."),
  email: optional(120, "Keep the email to 120 characters or fewer.").refine(
    (value) => value === null || z.email().safeParse(value).success,
    "Enter a valid email address, or leave it blank.",
  ),
  phone: optional(40, "Keep the phone to 40 characters or fewer."),
  address: optional(200, "Keep the address to 200 characters or fewer."),
  notes: optional(2000, "Keep the notes to 2000 characters or fewer."),
  /** Calendar days, not working days; blank means unknown. */
  leadTimeDays: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\d{1,3}$/.test(value),
      "Enter the lead time in whole days, for example 2.",
    )
    .refine(
      (value) => value === "" || Number(value) <= 365,
      "Keep the lead time to 365 days or fewer.",
    )
    .transform((value) => (value === "" ? null : Number(value))),
});

export type SupplierInput = z.infer<typeof supplierInputSchema>;
