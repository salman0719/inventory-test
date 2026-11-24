import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { signOut } from "@/app/(app)/actions";
import { isPlatformAdmin } from "@/lib/admin";
import { getSessionUser } from "@/lib/session";

/**
 * The admin area, outside the `(app)` group on purpose: a reviewer owns no business,
 * so the app layout's "requires a business" gate would send them to
 * `/awaiting-approval` instead of the queue.
 *
 * A signed-in account that is not on `platform_admins` gets a 404 rather than a 403,
 * so the route's existence is not advertised. That is a courtesy, not the boundary:
 * every function the pages call checks the admin list again in SQL.
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (!(await isPlatformAdmin(user.id))) notFound();

  return (
    <div className="min-h-dvh bg-surface text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 min-[600px]:px-5">
          <Link href="/admin" className="flex items-baseline gap-2">
            <span className="text-[15px] font-bold tracking-tight">Stk</span>
            <span className="text-[10px] uppercase tracking-[0.08em] text-ink-muted">
              Admin
            </span>
          </Link>

          <nav
            aria-label="Admin"
            className="flex items-center gap-3 text-[12px]"
          >
            <Link
              href="/admin"
              className="min-h-[32px] content-center text-ink-muted hover:text-accent"
            >
              Overview
            </Link>
            <Link
              href="/admin/registrations"
              className="min-h-[32px] content-center text-ink-muted hover:text-accent"
            >
              Registrations
            </Link>
            <Link
              href="/admin/accounts"
              className="min-h-[32px] content-center text-ink-muted hover:text-accent"
            >
              Accounts
            </Link>
            <Link
              href="/admin/businesses"
              className="min-h-[32px] content-center text-ink-muted hover:text-accent"
            >
              Businesses
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden max-w-[220px] truncate text-[11px] text-ink-muted min-[600px]:inline">
              {user.email}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="min-h-[32px] rounded border border-line bg-surface px-2.5 text-[12px] font-medium hover:border-accent hover:text-accent"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1100px] px-3 py-5 min-[600px]:px-5">
        {children}
      </main>
    </div>
  );
}
