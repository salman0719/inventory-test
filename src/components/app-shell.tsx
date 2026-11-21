import { Suspense } from "react";
import type { ReactNode } from "react";
import { getActiveBusiness } from "@/lib/businesses";
import { AppNav } from "./app-nav";
import { BusinessSwitcher } from "./business-switcher";
import { BusinessSwitcherSkeleton, LoadingAnnouncement } from "./skeletons";

/**
 * The application shell: Direction C rail, a compact top bar carrying the demo
 * business selector, and a content column. No authentication yet — the header
 * says so rather than implying a session exists.
 *
 * The shell itself is synchronous. The business query sits inside Suspense, so the
 * rail, top bar and page skeleton paint immediately instead of waiting on the
 * database; an async layout would block the whole page behind that one query.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-surface text-ink">
      <AppNav />
      <div className="min-[600px]:pl-[76px]">
        <header className="sticky top-0 z-30 flex min-h-[52px] items-center gap-3 border-b border-line bg-surface px-3 min-[600px]:min-h-[46px] min-[600px]:px-4">
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
          <span className="ml-auto hidden rounded border border-line bg-panel px-2 py-1 text-[11px] text-ink-muted min-[600px]:inline">
            No sign-in yet
          </span>
        </header>
        <main className="mx-auto w-full max-w-[1180px] px-3 py-5 min-[600px]:px-5">
          {children}
        </main>
      </div>
    </div>
  );
}

async function BusinessSelectorSlot() {
  const { businesses, active } = await getActiveBusiness();
  return <BusinessSwitcher businesses={businesses} active={active} />;
}
