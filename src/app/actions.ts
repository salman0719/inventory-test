"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { BUSINESS_COOKIE } from "@/lib/active-business";
import { listBusinesses } from "@/lib/businesses";

/**
 * Demo-only business switch. The id is checked against the businesses this
 * request can see, so an arbitrary id can never become the active dataset.
 * Replacement: derive the business from the signed-in user's memberships.
 */
export async function selectBusiness(businessId: string): Promise<void> {
  const businesses = await listBusinesses();
  if (!businesses.some((business) => business.id === businessId)) return;

  const store = await cookies();
  store.set(BUSINESS_COOKIE, businessId, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath("/", "layout");
}
