import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { isPlatformAdmin, noBusinessDestination } from "@/lib/admin";
import { getActiveBusiness } from "@/lib/businesses";
import { getSessionUser } from "@/lib/session";

/**
 * The application requires a business, not just a session.
 *
 * A registration only creates a business when an admin approves it, so a confirmed
 * account with no membership is signed in and sees nothing: every page would render
 * its "no business data" fallback with a navigation that leads to the same notice.
 * It is sent to `/awaiting-approval` instead, which is outside this group so the
 * redirect cannot loop. A platform reviewer is the exception: they have no business by
 * design, so they go to `/admin` rather than to a screen that would invite them to
 * register one.
 *
 * The query is the same `getActiveBusiness` the shell runs for the selector, and
 * React `cache()` collapses the two calls into one per request.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const { businesses } = await getActiveBusiness(user.id);
  if (businesses.length === 0) {
    redirect(noBusinessDestination(await isPlatformAdmin(user.id)));
  }

  return <AppShell>{children}</AppShell>;
}
