"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BUSINESS_COOKIE } from "@/lib/active-business";
import { listBusinesses } from "@/lib/businesses";
import { getSessionUser } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Switch the active business. The id is checked against the businesses this user
 * can actually see, so a guessed id cannot select another tenant even if the
 * cookie is edited by hand.
 *
 * The switch always lands on the dashboard: the URL's filters, page and open panel
 * describe rows of the business being left, so keeping them would mean showing the
 * new tenant a view it never asked for (or a "not in this business" panel).
 * `revalidatePath` clears the client cache first, so the navigation cannot be
 * answered from a payload fetched before the cookie changed.
 */
export async function selectBusiness(businessId: string): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const businesses = await listBusinesses(user.id);
  if (!businesses.some((business) => business.id === businessId)) return;

  const store = await cookies();
  store.set(BUSINESS_COOKIE, businessId, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath("/", "layout");
  redirect("/");
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}

/**
 * Leave this session and open the registration form.
 *
 * `/register` is closed to a signed-in visitor — the proxy sends them to `/` — so the
 * wait screen's "no registration" state could only offer a link back into a
 * redirect loop. Signing out first is the one button that makes the form reachable
 * again, which is what an applicant whose registration never filed needs.
 */
export async function signOutAndRegister(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/register");
}
