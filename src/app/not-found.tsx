import { PendingLink } from "@/components/pending-link";

/**
 * Any address that does not match a route. It renders inside the document shell
 * only, because there may be no session to build the app navigation from, so it
 * offers the way back rather than the rail.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[52ch] flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
        404
      </p>
      <h1 className="text-[18px] font-semibold tracking-tight">
        Page not found
      </h1>
      <p className="text-[13px] text-ink-muted">
        This address does not match a screen in Stk. Check the link, or start
        again from the dashboard.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <PendingLink
          href="/"
          className="inline-flex min-h-[36px] items-center rounded bg-accent px-3 text-[12px] font-semibold text-on-accent"
        >
          Go to dashboard
        </PendingLink>
        <PendingLink
          href="/products"
          className="inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-3 text-[12px] font-medium hover:border-accent hover:text-accent"
        >
          Products
        </PendingLink>
      </div>
    </main>
  );
}
