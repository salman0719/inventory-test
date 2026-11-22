import Link from "next/link";
import { NoBusinessNotice } from "@/components/no-business-notice";
import { PanelGrid, PanelProvider } from "@/components/panel-host";
import { PanelLink } from "@/components/panel-link";
import { PurchaseOrderFilters } from "@/components/purchase-orders/purchase-order-filters";
import { OrderPanelColumn } from "@/components/purchase-orders/order-panel-column";
import { PurchaseOrderTable } from "@/components/purchase-orders/purchase-order-table";
import { getActiveBusiness } from "@/lib/businesses";
import { formatMoney } from "@/lib/product-input";
import { parseOrderFilter } from "@/lib/purchase-order-input";
import { getPurchaseOrdersPage } from "@/lib/purchase-orders";
import { getSessionUser } from "@/lib/session";

const BUTTON =
  "inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-2.5 text-[12px] font-medium hover:border-accent hover:text-accent";

type SearchParams = Record<string, string | string[] | undefined>;

function single(params: SearchParams, key: string): string {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

/**
 * Purchase orders: one list, one open order per supplier, and the receiving panel
 * beside the row being worked on.
 *
 * The list's state lives in the URL; the open order does too, but its panel is
 * fetched by the panel itself (`/api/purchase-orders/panel`) — including the draft
 * editor's options and the receipt's idempotency key — so a row click never re-runs
 * this list.
 */
export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const user = await getSessionUser();
  if (!user) return null;

  const { active } = await getActiveBusiness(user.id);
  if (!active) return <NoBusinessNotice />;

  const q = single(params, "q").slice(0, 80);
  const filter = parseOrderFilter(single(params, "status"));
  const selectedId = single(params, "order");
  const creating = single(params, "new") === "true";
  const editing = single(params, "edit") === "true";
  const saved = single(params, "saved");
  const canViewValues = active.role !== "viewer";

  // One transaction for the filtered list and the counts above it.
  const { orders, summary } = await getPurchaseOrdersPage(user.id, active.id, {
    search: q,
    status: filter === "all" ? "" : filter,
  });

  const filtered = q !== "" || filter !== "all";

  function hrefFor(overrides: Record<string, string | undefined>): string {
    const values: Record<string, string | undefined> = {
      q: q || undefined,
      status: filter === "all" ? undefined : filter,
      order: selectedId || undefined,
      new: creating ? "true" : undefined,
      edit: editing ? "true" : undefined,
      saved: saved || undefined,
      ...overrides,
    };
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (value) search.set(key, value);
    }
    const query = search.toString();
    return query ? `/purchase-orders?${query}` : "/purchase-orders";
  }

  return (
    <PanelProvider initialHref={hrefFor({})}>
      <section className="flex flex-col gap-4">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-[15px] font-semibold tracking-tight">
            Purchase orders
          </h1>
          <p className="text-[12px] text-ink-muted">
            {filtered
              ? `${orders.length} match these filters`
              : `${summary.total} order${summary.total === 1 ? "" : "s"}`}{" "}
            · {summary.awaiting} awaiting delivery
            {canViewValues ? (
              <>
                {" "}
                · {formatMoney(summary.onOrderValue, active.currencyCode)} on
                order
              </>
            ) : null}{" "}
            · {active.name}
          </p>
          {creating ? null : (
            <PanelLink
              href={hrefFor({
                new: "true",
                order: undefined,
                edit: undefined,
                saved: undefined,
              })}
              className="ml-auto inline-flex min-h-[36px] items-center rounded bg-accent px-3 text-[12px] font-semibold text-on-accent"
            >
              New order
            </PanelLink>
          )}
        </header>

        <PurchaseOrderFilters q={q} status={filter} />

        <PanelGrid panel={<OrderPanelColumn />} label="Order details">
          <div className="flex min-w-0 flex-col gap-3">
            {orders.length > 0 ? (
              <PurchaseOrderTable
                orders={orders}
                currency={active.currencyCode}
                rowHref={(orderId) =>
                  hrefFor({ order: orderId, saved: undefined })
                }
                canViewValues={canViewValues}
              />
            ) : (
              <div className="rounded border border-dashed border-line bg-panel px-4 py-12 text-center">
                <p className="text-[13px] font-medium">
                  {filtered
                    ? "No orders match those filters"
                    : "No purchase orders yet"}
                </p>
                <p className="mx-auto mt-1 max-w-[46ch] text-[12px] text-ink-muted">
                  {filtered
                    ? "Clear the filters, or search for a different order number or supplier."
                    : "Create an order for one supplier, then receive it in full or in parts as deliveries arrive."}
                </p>
                {filtered ? (
                  <Link href="/purchase-orders" className={`${BUTTON} mt-4`}>
                    Clear filters
                  </Link>
                ) : (
                  <PanelLink
                    href={hrefFor({ new: "true" })}
                    className={`${BUTTON} mt-4`}
                  >
                    New order
                  </PanelLink>
                )}
              </div>
            )}

            {orders.length === 100 ? (
              <p className="text-[11.5px] text-ink-faint">
                Showing the 100 most recent orders. Filter by status or search
                to narrow the list.
              </p>
            ) : null}
          </div>
        </PanelGrid>
      </section>
    </PanelProvider>
  );
}
