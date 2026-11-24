import { z } from "zod";

/**
 * What the admin panel accepts from the browser.
 *
 * The queue's state lives in the URL, so the filter is parsed rather than trusted:
 * an unknown status falls back to "all" instead of reaching SQL. A decision posts a
 * request id and an optional note, both bounded here because the note is shown to
 * the applicant and stored on their row.
 */

export const REGISTRATION_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const;

export const registrationStatusSchema = z.enum(REGISTRATION_STATUSES);

/** The three statuses plus the queue's "every status" view. */
export const FILTER_STATUSES = [
  "all",
  "pending",
  "approved",
  "rejected",
] as const;

export const registrationFilterSchema = z.object({
  status: z.enum(FILTER_STATUSES).catch("all"),
  search: z.string().trim().max(80).catch(""),
});

export type RegistrationFilter = z.infer<typeof registrationFilterSchema>;

/** The URL's two parameters as a filter; anything unreadable becomes the default. */
export function parseRegistrationFilter(params: {
  status?: string | string[];
  q?: string | string[];
}): RegistrationFilter {
  const single = (value: string | string[] | undefined) =>
    typeof value === "string" ? value : undefined;

  return registrationFilterSchema.parse({
    status: single(params.status) ?? "all",
    search: single(params.q) ?? "",
  });
}

/**
 * A free-text search from a query string. Bounded before it reaches SQL, and an
 * over-long or repeated value becomes an empty search rather than an error page.
 */
export const adminSearchSchema = z.string().trim().max(80).catch("");

export function parseAdminSearch(value: string | string[] | undefined): string {
  return adminSearchSchema.parse(typeof value === "string" ? value : "");
}

export const decisionSchema = z.object({
  requestId: z.uuid("That registration is no longer available."),
  note: z
    .string()
    .trim()
    .max(500, "Keep the note to 500 characters or fewer.")
    .optional(),
});

/**
 * What the approve form posts. Two shapes share it: creating a business (no target,
 * owner) and attaching to one (a target, staff or viewer).
 *
 * `owner` on an existing business is refused here as well as in SQL: handing over
 * someone else's books is not a queue decision, and the form should not send it.
 */
export const approvalRoleSchema = z.enum(["owner", "staff", "viewer"]);

/** The roles a reviewer may grant on a business that already exists. */
export const attachRoleSchema = z.enum(["staff", "viewer"]);

export const approvalSchema = z
  .object({
    requestId: z.uuid("That registration is no longer available."),
    businessId: z.uuid().optional(),
    role: approvalRoleSchema.catch("owner"),
  })
  .refine((value) => value.businessId === undefined || value.role !== "owner", {
    path: ["role"],
    message: "Attach a colleague as staff or viewer.",
  });

/** The role label carried back after an attach, for the confirmation banner. */
export function parseAttachRole(value: string | string[] | undefined) {
  return attachRoleSchema.catch("staff").parse(value);
}

/**
 * A failed decision, as a short code the detail screen turns into a sentence. The
 * PostgreSQL error carries the reason; the browser gets no SQL text.
 */
export type DecisionError =
  | "not-admin"
  | "missing"
  | "no-business"
  | "role"
  | "rejected"
  | "approved"
  | "invalid"
  | "failed";

export function decisionErrorCode(error: unknown): DecisionError {
  if (typeof error !== "object" || error === null) return "failed";
  const { code, message } = error as { code?: string; message?: string };
  const text = typeof message === "string" ? message : "";

  if (code === "42501") return "not-admin";
  // P0002 covers two different sentences: a registration that is gone, and a target
  // business that is gone. The reviewer needs to know which one to reload.
  if (code === "P0002") {
    return /business does not exist/i.test(text) ? "no-business" : "missing";
  }
  if (code === "22023") {
    if (/was rejected/i.test(text)) return "rejected";
    if (/already approved/i.test(text)) return "approved";
    if (/ownership|role only applies/i.test(text)) return "role";
  }
  return "failed";
}
