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

export type AccountRow = {
  userId: string;
  email: string;
  emailConfirmed: boolean;
  createdAt: Date;
  businessId: string | null;
  businessName: string | null;
  role: string | null;
  registrationStatus: RegistrationStatus | null;
};

export type BusinessSummary = {
  id: string;
  name: string;
  businessType: BusinessType;
  createdAt: Date;
  products: number;
  openOrders: number;
  members: number;
  ownerEmail: string | null;
};

/** The identity-and-counts part of a business: enough to recognise one, never its books. */
export type BusinessIdentity = Omit<BusinessSummary, "products" | "openOrders">;

/** An existing business whose name resembles an applicant's claim. */
export type BusinessCandidate = BusinessIdentity & {
  /** Normalised equality: almost certainly the same business. */
  exact: boolean;
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

type AccountDbRow = {
  user_id: string;
  email: string;
  email_confirmed: boolean;
  created_at: Date;
  business_id: string | null;
  business_name: string | null;
  role: string | null;
  registration_status: string | null;
};

type BusinessDbRow = {
  id: string;
  name: string;
  business_type: string;
  created_at: Date;
  products: number;
  open_orders: number;
  members: number;
  owner_email: string | null;
};

/** Every account with the business it belongs to, or nulls when it has none. */
export async function listAccounts(
  userId: string,
  search: string,
): Promise<AccountRow[]> {
  return withTenant(userId, async (client) => {
    const result = await client.query<AccountDbRow>(
      "select * from private.list_accounts($1)",
      [search === "" ? null : search],
    );
    return result.rows.map((row) => ({
      userId: row.user_id,
      email: row.email,
      emailConfirmed: row.email_confirmed,
      createdAt: row.created_at,
      businessId: row.business_id,
      businessName: row.business_name,
      role: row.role,
      registrationStatus: row.registration_status as RegistrationStatus | null,
    }));
  });
}

/** Every business as counts and its owner, never its catalogue. */
export async function listBusinesses(
  userId: string,
  search: string,
): Promise<BusinessSummary[]> {
  return withTenant(userId, async (client) => {
    const result = await client.query<BusinessDbRow>(
      "select * from private.list_businesses($1)",
      [search === "" ? null : search],
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      businessType: row.business_type as BusinessType,
      createdAt: row.created_at,
      products: row.products,
      openOrders: row.open_orders,
      members: row.members,
      ownerEmail: row.owner_email,
    }));
  });
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

type BusinessIdentityRow = {
  id: string;
  name: string;
  business_type: string;
  created_at: Date;
  members: number;
  owner_email: string | null;
};

type BusinessCandidateRow = BusinessIdentityRow & { exact: boolean };

function toIdentity(row: BusinessIdentityRow): BusinessIdentity {
  return {
    id: row.id,
    name: row.name,
    businessType: row.business_type as BusinessType,
    createdAt: row.created_at,
    members: row.members,
    ownerEmail: row.owner_email,
  };
}

/**
 * Businesses that look like the one an applicant asked for. The match is a suggestion
 * the reviewer judges — the function normalises case, punctuation and the words
 * "the"/"and", so "Bean & Gone" and "Bean and Gone" are one candidate.
 */
export async function matchBusinesses(
  userId: string,
  businessName: string,
): Promise<BusinessCandidate[]> {
  return withTenant(userId, async (client) => {
    const result = await client.query<BusinessCandidateRow>(
      "select * from private.match_businesses($1, $2)",
      [businessName, 5],
    );
    return result.rows.map((row) => ({ ...toIdentity(row), exact: row.exact }));
  });
}

/** One business by id, for the screen that reports what an approval did. */
export async function getAdminBusiness(
  userId: string,
  id: string,
): Promise<BusinessIdentity | null> {
  return withTenant(userId, async (client) => {
    const result = await client.query<BusinessIdentityRow>(
      "select * from private.get_admin_business($1)",
      [id],
    );
    const row = result.rows[0];
    return row ? toIdentity(row) : null;
  });
}
