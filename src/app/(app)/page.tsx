import { PendingLink } from "@/components/pending-link";
import { AttentionTable } from "@/components/dashboard/attention-table";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { RecentMovements } from "@/components/dashboard/recent-movements";
import { NoBusinessNotice } from "@/components/no-business-notice";
import { getActiveBusiness } from "@/lib/businesses";
import { ATTENTION_LIMIT, getDashboard } from "@/lib/dashboard";
import { getSessionUser } from "@/lib/session";

/**
 * The dashboard answers three questions in order: how much stock is there and what
 * is it worth, what is about to run out, and what moved recently. Every figure is
 * read from the tables and the ledger, so it is never a separately stored number
 * that can drift.
 */
export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const { active } = await getActiveBusiness(user.id);
  if (!active) return <NoBusinessNotice />;

  const canViewValues = active.role !== "viewer";

  const { summary, attention, movements } = await getDashboard(
    user.id,
    active.id,
  );

  return (
    <div className="flex flex-col gap-4">
      <header>
        <p className="text-[10px] uppercase tracking-[0.08em] text-ink-muted">
          Dashboard
        </p>
        <h1 className="mt-0.5 text-[17px] font-semibold tracking-tight">
          {active.name}
        </h1>
        <p className="text-[12px] text-ink-muted">
          {active.businessType === "cafe" ? "Cafe" : "Retail"} ·{" "}
          {active.currencyCode} · Live from the catalogue, orders and stock
          ledger.
        </p>
      </header>

      <DashboardStats
        summary={summary}
        currency={active.currencyCode}
        canViewValues={canViewValues}
      />

      {summary.products === 0 ? (
        <div className="rounded border border-dashed border-line bg-panel px-4 py-12 text-center">
          <p className="text-[13px] font-medium">No products yet</p>
          <p className="mx-auto mt-1 max-w-[46ch] text-[12px] text-ink-muted">
            Add products and their opening stock, and this page will show what
            is low, what is on order and what moved.
          </p>
          <PendingLink
            href="/products"
            className="mt-4 inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-3 text-[12px] font-medium hover:border-accent hover:text-accent"
          >
            Open products
          </PendingLink>
        </div>
      ) : (
        <AttentionTable
          items={attention}
          total={summary.lowCount + summary.outCount}
          limit={ATTENTION_LIMIT}
        />
      )}

      <RecentMovements movements={movements} />
    </div>
  );
}
