import Link from "next/link";
import { Suspense } from "react";
import type { ReactNode } from "react";
import { signOut } from "@/app/(app)/actions";
import { isPlatformAdmin } from "@/lib/admin";
import { getActiveBusiness } from "@/lib/businesses";
import { PAGE_CONTENT_ID } from "@/lib/nav";
import { getSessionUser } from "@/lib/session";
import { AppNav } from "./app-nav";
import { BusinessSwitcher } from "./business-switcher";
import { BusinessSwitcherSkeleton, LoadingAnnouncement } from "./skeletons";

/**
 * The application shell: Direction C rail, a compact top bar carrying the demo
 * business selector and the signed-in user, and a content column.
 *
 * The shell stays synchronous so the rail and top bar paint immediately; both
 * requests that need the network (session, then membership-filtered businesses)
 * sit in their own Suspense boundaries.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-surface text-ink">
      <AppNav />
      {/* The phone's More sheet makes this column inert while it is open. */}
      <div id={PAGE_CONTENT_ID} className="min-[600px]:pl-[76px]">
        <header className="sticky top-0 z-30 flex min-h-[52px] items-center gap-3 border-b border-line bg-surface px-3 min-[600px]:min-h-[46px] min-[600px]:px-4">
          {/* The rail carries the wordmark from 600px up; below that the rail is
              gone, so it moves into the header and stays the home link. */}
          <Link
            href="/"
            aria-label="Stk home"
            className="inline-flex min-h-[44px] items-center text-[14px] font-bold tracking-tight text-ink min-[600px]:hidden"
          >
            Stk
          </Link>
          <Suspense
            fallback={
              <>
                <LoadingAnnouncement label="Loading business" />
                <BusinessSwitcherSkeleton />
              </>
            }
          >
            <BusinessSelectorSlot />
          </Suspense>
          <div className="ml-auto">
            <Suspense fallback={null}>
              <UserMenu />
            </Suspense>
          </div>
        </header>
        <main className="mobile-tab-space mx-auto w-full max-w-[1180px] px-3 py-5 min-[600px]:px-5">
          {children}
        </main>
      </div>
    </div>
  );
}

async function BusinessSelectorSlot() {
  const user = await getSessionUser();
  if (!user) return null;
  const { businesses, active } = await getActiveBusiness(user.id);
  return <BusinessSwitcher businesses={businesses} active={active} />;
}

async function UserMenu() {
  const user = await getSessionUser();
  if (!user) return null;

  // One indexed lookup inside this Suspense boundary, because a reviewer who also
  // owns a business never hits the gate's redirect and would otherwise have no way
  // into `/admin`. Desktop only: reviewing is a wide-screen job, and the phone header
  // has no room for another control between the switcher and Sign out.
  const admin = await isPlatformAdmin(user.id);

  return (
    <div className="flex items-center gap-2">
      {admin ? (
        <Link
          href="/admin"
          className="hidden min-h-[36px] content-center rounded border border-line bg-surface px-2.5 text-[12px] font-medium text-ink-muted hover:border-accent hover:text-accent min-[600px]:inline-flex"
        >
          Admin
        </Link>
      ) : null}
      <span className="hidden max-w-[220px] truncate text-[11px] text-ink-muted min-[600px]:inline">
        {user.email}
      </span>
      <form action={signOut}>
        <button
          type="submit"
          className="min-h-[36px] rounded border border-line bg-surface px-2.5 text-[12px] font-medium hover:border-accent hover:text-accent"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
