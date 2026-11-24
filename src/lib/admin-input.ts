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
 * A failed decision, as a short code the detail screen turns into a sentence. The
 * PostgreSQL error carries the reason; the browser gets no SQL text.
 */
export type DecisionError =
  "not-admin" | "missing" | "rejected" | "approved" | "invalid" | "failed";

export function decisionErrorCode(error: unknown): DecisionError {
  if (typeof error !== "object" || error === null) return "failed";
  const { code, message } = error as { code?: string; message?: string };
  const text = typeof message === "string" ? message : "";

  if (code === "42501") return "not-admin";
  if (code === "P0002") return "missing";
  if (code === "22023") {
    if (/was rejected/i.test(text)) return "rejected";
    if (/already approved/i.test(text)) return "approved";
  }
  return "failed";
}
