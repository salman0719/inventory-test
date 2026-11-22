import { cookies } from "next/headers";
import { cache } from "react";
import {
  BUSINESS_COOKIE,
  pickBusiness,
  type BusinessOption,
  type BusinessType,
} from "./active-business";
import { withTenant } from "./db";

type BusinessRow = {
  id: string;
  name: string;
  business_type: string;
  currency_code: string;
};

function toOption(row: BusinessRow): BusinessOption {
  return {
    id: row.id,
    name: row.name,
    businessType: row.business_type as BusinessType,
    currencyCode: row.currency_code,
  };
}

/**
 * Businesses this user belongs to. The policy on `businesses` filters by
 * membership, so this query has no `where` clause of its own: a user who is not a
 * member cannot receive the row even if the application forgot to filter.
 */
export async function listBusinesses(
  userId: string,
): Promise<BusinessOption[]> {
  const rows = await withTenant(userId, async (client) => {
    const result = await client.query<BusinessRow>(
      "select id, name, business_type, currency_code from businesses order by name",
    );
    return result.rows;
  });
  return rows.map(toOption);
}

/** Request-scoped: the shell and the page share one query. */
export const getActiveBusiness = cache(
  async (
    userId: string,
  ): Promise<{
    businesses: BusinessOption[];
    active: BusinessOption | null;
  }> => {
    const businesses = await listBusinesses(userId);
    const store = await cookies();
    const active = pickBusiness(businesses, store.get(BUSINESS_COOKIE)?.value);
    return { businesses, active };
  },
);
