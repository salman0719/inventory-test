import type { ReactNode } from "react";
import { getActiveBusiness } from "@/lib/businesses";
import { AppNav } from "./app-nav";
import { BusinessSwitcher } from "./business-switcher";

/**
 * The application shell: Direction C rail, a compact top bar carrying the demo
 * business selector, and a content column. No authentication yet — the header
 * says so rather than implying a session exists.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const { businesses, active } = await getActiveBusiness();

  return (
    <div className="min-h-dvh bg-surface text-ink">
      <AppNav />
      <div className="min-[600px]:pl-[76px]">
        <header className="sticky top-0 z-30 flex min-h-[52px] items-center gap-3 border-b border-line bg-surface px-3 min-[600px]:min-h-[46px] min-[600px]:px-4">
          <BusinessSwitcher businesses={businesses} active={active} />
          <span className="ml-auto hidden rounded border border-line bg-panel px-2 py-1 text-[11px] text-ink-muted min-[600px]:inline">
            No sign-in yet
          </span>
        </header>
        <main className="mx-auto w-full max-w-[1180px] px-3 py-5 min-[600px]:px-5">
          {active ? (
            children
          ) : (
            <div className="rounded border border-dashed border-line bg-panel px-4 py-12 text-center">
              <p className="text-[13px] font-medium">No business data</p>
              <p className="mx-auto mt-1 max-w-[46ch] text-[12px] text-ink-muted">
                Start the local database and seed the two demo businesses with{" "}
                <code className="font-mono">npm run db:up</code> then{" "}
                <code className="font-mono">npm run db:seed</code>.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
