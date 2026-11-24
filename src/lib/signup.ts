import { z } from "zod";
import type { BusinessType } from "./active-business";
import { withTenant } from "./db";

/**
 * Self-service registration and the approval queue it feeds.
 *
 * Two boundaries are validated here. `registerSchema` is what the form posts;
 * `requestSchema` is what Supabase Auth hands back in a new user's metadata, which
 * arrived from the browser too, so it is parsed again rather than trusted.
 *
 * There is no service-role key in this project, so nothing here may create an auth
 * user or bypass RLS. A registration row is inserted by the applicant themselves —
 * `signup_requests_insert` requires `user_id = auth.uid()` and `status = 'pending'`
 * — and only a platform admin can approve it, through a SECURITY DEFINER function
 * that creates the business and the owner membership in one transaction.
 */

export const BUSINESS_TYPES = ["cafe", "retail", "other"] as const;

/** Long enough to matter, short enough for bcrypt (Supabase's 72-byte limit). */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

export const registerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Enter your full name.")
    .max(80, "Keep your name to 80 characters or fewer."),
  businessName: z
    .string()
    .trim()
    .min(2, "Enter your business name.")
    .max(80, "Keep the business name to 80 characters or fewer."),
  businessType: z.enum(BUSINESS_TYPES, "Choose a business type."),
  email: z.email("Enter a valid email address."),
  password: z
    .string()
    .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
    .max(PASSWORD_MAX, `Use ${PASSWORD_MAX} characters or fewer.`),
});

export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * What the form should say when Supabase Auth refuses a sign-up.
 *
 * The three limits that block registration all return 429 and two of them share
 * `over_email_send_rate_limit`, so the code alone is not enough: the built-in
 * mailer allows **two emails an hour for the whole project**, one address can be
 * asked again only after 60 seconds, and an IP gets its own request limit. Telling
 * an applicant to "wait a minute" for the hourly cap is what made a working
 * project look broken — the wait is up to an hour, and the allowance is shared by
 * every environment pointed at the same Supabase project.
 *
 * `email_address_not_authorized` is the other trap: without custom SMTP, Supabase
 * delivers only to the organisation's own team addresses, so a real applicant's
 * address is refused outright rather than rate-limited.
 */
export function registerErrorMessage(
  code: string | undefined,
  message = "",
): string {
  switch (code) {
    case "over_email_send_rate_limit":
      return /after \d+ seconds/i.test(message)
        ? "That address was just emailed. Open the link, or wait a minute before asking again."
        : "No email allowance left this hour — the built-in mailer sends two an hour for the whole project. Try again later, or ask us to add the account by hand.";
    case "over_request_rate_limit":
      return "Too many attempts from this network just now. Wait a few minutes and try again.";
    case "email_address_not_authorized":
      return "Until a mail provider is connected, this project can only email its own team. Ask us to add the account by hand.";
    case "weak_password":
      return "Choose a stronger password and try again.";
    case "email_address_invalid":
      return "Enter a valid email address.";
    case "signup_disabled":
    case "email_provider_disabled":
      return "Registration is closed right now. Ask us to create the account instead.";
    default:
      return "We could not create the account. Try again in a moment.";
  }
}

/** What `register` puts in `signUp`'s `data`, and what the request row is built from. */
const requestSchema = z.object({
  fullName: z.string().trim().min(1).max(80),
  businessName: z.string().trim().min(1).max(80),
  businessType: z.enum(BUSINESS_TYPES),
});

/**
 * The registration form's answers as stored on the auth user, or null when the
 * account was not created by that form. Exported so the mapping is testable without
 * a database: a metadata field the browser controls must never reach SQL unparsed.
 */
export function parseSignupMetadata(metadata: Record<string, unknown>): {
  fullName: string;
  businessName: string;
  businessType: BusinessType;
} | null {
  const parsed = requestSchema.safeParse({
    fullName: metadata.full_name,
    businessName: metadata.business_name,
    businessType: metadata.business_type,
  });
  return parsed.success ? parsed.data : null;
}

export type SignupRequest = {
  status: "pending" | "approved" | "rejected";
  businessName: string;
  businessType: BusinessType;
  createdAt: Date;
  decidedAt: Date | null;
  adminNote: string | null;
};

type Row = {
  status: string;
  business_name: string;
  business_type: string;
  created_at: Date;
  decided_at: Date | null;
  admin_note: string | null;
};

/**
 * Create the applicant's request row if it is not there yet, from the metadata the
 * registration form stored on the auth user. Called after the address is confirmed
 * (and again when a session exists but no row does, which is what happens if email
 * confirmation is ever turned off).
 *
 * Accounts that were not created by the registration form — invited, demo, linked
 * by hand — have no such metadata and are skipped.
 *
 * The unique index on `user_id` makes this safe to repeat: `on conflict do nothing`
 * leaves an approved or rejected decision exactly as an admin left it.
 */
export async function ensureSignupRequest(
  userId: string,
  email: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const parsed = parseSignupMetadata(metadata);
  if (!parsed) return;

  await withTenant(userId, async (client) => {
    await client.query(
      `insert into signup_requests
         (user_id, email, full_name, business_name, business_type)
       values ($1, $2, $3, $4, $5)
       on conflict (user_id) do nothing`,
      [
        userId,
        email.trim().toLowerCase(),
        parsed.fullName,
        parsed.businessName,
        parsed.businessType,
      ],
    );
  });
}

/** The signed-in user's request, or null when they never registered. */
export async function getSignupRequest(
  userId: string,
): Promise<SignupRequest | null> {
  return withTenant(userId, async (client) => {
    const result = await client.query<Row>(
      `select status, business_name, business_type, created_at, decided_at,
              admin_note
         from signup_requests
        where user_id = $1
        order by created_at desc
        limit 1`,
      [userId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      status: row.status as SignupRequest["status"],
      businessName: row.business_name,
      businessType: row.business_type as BusinessType,
      createdAt: row.created_at,
      decidedAt: row.decided_at,
      adminNote: row.admin_note,
    };
  });
}
