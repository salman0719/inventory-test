import { NoBusinessNotice } from "@/components/no-business-notice";
import { PageHeader, headerActionSecondary } from "@/components/page-header";
import { PendingLink } from "@/components/pending-link";
import { ReorderGroup } from "@/components/reorder/reorder-group";
import { getActiveBusiness } from "@/lib/businesses";
import { getReorderPage } from "@/lib/reorder";
import { getSessionUser } from "@/lib/session";

const BUTTON =
  "inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-2.5 text-[12px] font-medium hover:border-accent hover:text-accent";

/**
 * Reorder: what to buy, supplier by supplier.
 *
 * The formula is stated on the screen rather than hidden behind a number: target
 * stock minus on-hand minus what is already on a sent order. Drafts are not
 * subtracted, because they have not been promised to the supplier, but a product
 * already on the supplier's draft is marked so it cannot be added twice.
 */
export default async function ReorderPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const { active } = await getActiveBusiness(user.id);
  if (!active) return <NoBusinessNotice />;

  const data = await getReorderPage(user.id, active.id);
  const canOrder = active.role !== "viewer";

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title="Reorder"
        summary={
          <>
            {data.productCount} product{data.productCount === 1 ? "" : "s"} ·{" "}
            {data.supplierCount} supplier{data.supplierCount === 1 ? "" : "s"} ·{" "}
            {active.name}
          </>
        }
        actions={
          <PendingLink href="/products" className={headerActionSecondary}>
            Edit target stock
          </PendingLink>
        }
      />

      <div className="rounded border border-line bg-panel px-3 py-2.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-muted">
          How the suggestion is worked out
        </h2>
        <p className="mt-1 text-[12.5px]">
          <span className="font-mono">
            suggested = target stock − on hand − on order
          </span>
          , never below zero.
        </p>
        <p className="mt-1 text-[11.5px] text-ink-muted">
          The target is the product&apos;s <strong>Target stock</strong>, or
          twice its reorder level when none is set. On order means a purchase
          order that is <em>Ordered</em> or <em>Partly received</em>; a draft is
          not counted until it is sent. Quantities are editable before you
          select them.
        </p>
      </div>

      {data.groups.length === 0 ? (
        <div className="rounded border border-dashed border-line bg-panel px-4 py-12 text-center">
          <p className="text-[13px] font-medium">Nothing to reorder</p>
          <p className="mx-auto mt-1 max-w-[52ch] text-[12px] text-ink-muted">
            Every active product with a supplier is at or above its target
            stock. Lower a target or record stock leaving to see a suggestion
            here.
          </p>
          <PendingLink href="/products" className={`${BUTTON} mt-4`}>
            Open products
          </PendingLink>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {data.groups.map((group) => (
            <ReorderGroup
              key={group.supplierId}
              group={group}
              canOrder={canOrder}
            />
          ))}
        </div>
      )}

      {data.unassignedCount > 0 ? (
        <p className="text-[11.5px] text-ink-faint">
          {data.unassignedCount} active product
          {data.unassignedCount === 1 ? " has" : "s have"} no supplier and
          cannot be suggested.{" "}
          <PendingLink href="/products" className="text-accent hover:underline">
            Set a supplier on the product
          </PendingLink>
          .
        </p>
      ) : null}
    </section>
  );
}
