import type { BusinessType } from "./active-business";
import type { RegistrationFilter } from "./admin-input";
import { withTenant } from "./db";

/**
 * The admin panel's data, always read through the same `withTenant` path as the rest
 * of the app: the pool connects as `app_user`, the transaction sets `role` to
 * `authenticated`, and the SECURITY DEFINER functions in `0009_admin_panel.sql`
 * decide whether this caller may see anything. A missing admin row therefore fails
 * closed in the database, not just in the layout.
 */

export type RegistrationStatus = "pending" | "approved" | "rejected";

export type Registration = {
  id: string;
  status: RegistrationStatus;
  fullName: string;
  email: string;
  businessName: string;
  businessType: BusinessType;
  createdAt: Date;
  decidedAt: Date | null;
  adminNote: string | null;
  businessId: string | null;
  /** False means the applicant never opened the link, so they are not in the queue. */
  emailConfirmed: boolean;
};

export type RecentDecision = {
  id: string;
  businessName: string;
  status: RegistrationStatus;
  decidedAt: string;
};

export type AdminOverview = {
  pending: number;
  newThisWeek: number;
  businesses: number;
  accounts: number;
  unconfirmed: number;
  decidedThisWeek: number;
  recent: RecentDecision[];
};

type RegistrationRow = {
  id: string;
  status: string;
  full_name: string;
  email: string;
  business_name: string;
  business_type: string;
  created_at: Date;
  decided_at: Date | null;
  admin_note: string | null;
  business_id: string | null;
  email_confirmed: boolean;
};

function toRegistration(row: RegistrationRow): Registration {
  return {
    id: row.id,
    status: row.status as RegistrationStatus,
    fullName: row.full_name,
    email: row.email,
    businessName: row.business_name,
    businessType: row.business_type as BusinessType,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    adminNote: row.admin_note,
    businessId: row.business_id,
    emailConfirmed: row.email_confirmed,
  };
}

/**
 * Whether this account reviews registrations. The layout asks once per render; every
 * function asks again in SQL, because a URL is not the boundary.
 */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  return withTenant(userId, async (client) => {
    const result = await client.query<{ is_admin: boolean }>(
      "select private.is_platform_admin() as is_admin",
    );
    return result.rows[0]?.is_admin === true;
  });
}

export async function getAdminOverview(userId: string): Promise<AdminOverview> {
  return withTenant(userId, async (client) => {
    const result = await client.query<{ overview: AdminOverview }>(
      "select private.admin_overview() as overview",
    );
    const overview = result.rows[0]?.overview;
    if (!overview) throw new Error("The admin overview returned no row.");
    return overview;
  });
}

export async function listRegistrations(
  userId: string,
  filter: RegistrationFilter,
): Promise<Registration[]> {
  return withTenant(userId, async (client) => {
    const result = await client.query<RegistrationRow>(
      `select * from private.list_signup_requests($1, $2, $3)`,
      [
        filter.status === "all" ? null : filter.status,
        filter.search === "" ? null : filter.search,
        filter.status === "pending" ? 100 : 200,
      ],
    );
    return result.rows.map(toRegistration);
  });
}

/** A date as the panel writes them: "24 Nov 2026", independent of the server's locale. */
export function formatDay(value: Date): string {
  return value.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** How long an applicant has been waiting, in whole days, for the queue's right column. */
export function waitingLabel(createdAt: Date): string {
  const days = Math.floor((Date.now() - createdAt.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  return days === 1 ? "1 day" : `${days} days`;
}

export async function getRegistration(
  userId: string,
  id: string,
): Promise<Registration | null> {
  return withTenant(userId, async (client) => {
    const result = await client.query<RegistrationRow>(
      "select * from private.get_signup_request($1)",
      [id],
    );
    const row = result.rows[0];
    return row ? toRegistration(row) : null;
  });
}
