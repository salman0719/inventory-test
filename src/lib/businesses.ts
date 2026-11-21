import { cookies } from "next/headers";
import { cache } from "react";
import {
  BUSINESS_COOKIE,
  pickBusiness,
  type BusinessOption,
  type BusinessType,
} from "./active-business";
import { getPool } from "./db";

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
 * Businesses visible to the current request. Pre-auth this is every seeded
 * business; after authentication it becomes an RLS-filtered membership query.
 */
export async function listBusinesses(): Promise<BusinessOption[]> {
  const result = await getPool().query<BusinessRow>(
    "select id, name, business_type, currency_code from businesses order by name",
  );
  return result.rows.map(toOption);
}

/** Request-scoped: the shell and the page share one query. */
export const getActiveBusiness = cache(async () => {
  const businesses = await listBusinesses();
  const store = await cookies();
  const active = pickBusiness(businesses, store.get(BUSINESS_COOKIE)?.value);
  return { businesses, active };
});
