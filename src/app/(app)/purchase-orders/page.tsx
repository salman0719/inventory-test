import { randomUUID } from "node:crypto";
import Link from "next/link";
import { NoBusinessNotice } from "@/components/no-business-notice";
import { PurchaseOrderFilters } from "@/components/purchase-orders/purchase-order-filters";
import {
  PurchaseOrderForm,
  type OrderFormDefaults,
} from "@/components/purchase-orders/purchase-order-form";
import { PurchaseOrderPanel } from "@/components/purchase-orders/purchase-order-panel";
import { PurchaseOrderTable } from "@/components/purchase-orders/purchase-order-table";
import { getActiveBusiness } from "@/lib/businesses";
import { formatMoney } from "@/lib/product-input";
import { parseOrderFilter, quantityField } from "@/lib/purchase-order-input";
import {
  getOrderFormOptions,
  getOrderSummary,
  getPurchaseOrder,
  listPurchaseOrders,
} from "@/lib/purchase-orders";
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
 * As on the other lists, the view lives in the URL, so "awaiting delivery" is a
 * link you can send. The idempotency key for a delivery is generated per render:
 * a double submission replays it instead of posting stock twice.
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

  const [orders, summary, selected] = await Promise.all([
    listPurchaseOrders(user.id, active.id, {
      search: q,
      status: filter === "all" ? "" : filter,
    }),
    getOrderSummary(user.id, active.id),
    selectedId ? getPurchaseOrder(user.id, active.id, selectedId) : null,
  ]);

  const editingDraft =
    selected !== null && selected.order.status === "draft" && editing;
  const showEditor = creating || editingDraft;
  const options = showEditor
    ? await getOrderFormOptions(user.id, active.id)
    : null;

  const defaults: OrderFormDefaults =
    editingDraft && selected
      ? {
          id: selected.order.id,
          supplierId: selected.order.supplierId,
          expectedDeliveryAt: selected.order.expectedDeliveryAt ?? "",
          notes: selected.order.notes ?? "",
          lines: selected.lines.map((line) => ({
            productId: line.productId,
            quantity: quantityField(line.quantityOrdered),
            unitCost: line.unitCost,
          })),
        }
      : {
          id: "",
          supplierId: "",
          expectedDeliveryAt: "",
          notes: "",
          lines: [],
        };

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

  const closeHref = hrefFor({
    order: undefined,
    new: undefined,
    edit: undefined,
    saved: undefined,
  });
  const showPanel = creating || selectedId !== "";

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-[15px] font-semibold tracking-tight">
          Purchase orders
        </h1>
        <p className="text-[12px] text-ink-muted">
          {filtered
            ? `${orders.length} match these filters`
            : `${summary.total} order${summary.total === 1 ? "" : "s"}`}{" "}
          · {summary.awaiting} awaiting delivery ·{" "}
          {formatMoney(summary.onOrderValue, active.currencyCode)} on order ·{" "}
          {active.name}
        </p>
        {showEditor ? null : (
          <Link
            href={hrefFor({
              new: "true",
              order: undefined,
              edit: undefined,
              saved: undefined,
            })}
            className="ml-auto inline-flex min-h-[36px] items-center rounded bg-accent px-3 text-[12px] font-semibold text-on-accent"
          >
            New order
          </Link>
        )}
      </header>

      <PurchaseOrderFilters q={q} status={filter} />

      <div
        className={`grid gap-3 ${
          showPanel
            ? "min-[900px]:grid-cols-[minmax(0,1fr)_360px] min-[900px]:items-start"
            : ""
        }`}
      >
        {showPanel ? (
          <div className="order-first min-[900px]:order-last min-[900px]:sticky min-[900px]:top-3">
            {showEditor && options ? (
              <div className="rounded border border-line bg-surface">
                <header className="flex items-center gap-2 border-b border-line px-3 py-2">
                  <h2 className="min-w-0 truncate text-[13px] font-semibold">
                    {editingDraft && selected
                      ? `Edit ${selected.order.orderNumber}`
                      : "New purchase order"}
                  </h2>
                  <Link
                    href={closeHref}
                    aria-label="Close order panel"
                    className={`${BUTTON} ml-auto shrink-0`}
                  >
                    Close
                  </Link>
                </header>
                <div className="px-3 py-3">
                  <PurchaseOrderForm
                    mode={editingDraft ? "edit" : "create"}
                    suppliers={options.suppliers}
                    products={options.products}
                    defaults={defaults}
                    cancelHref={closeHref}
                  />
                </div>
              </div>
            ) : selected ? (
              <PurchaseOrderPanel
                detail={selected}
                currency={active.currencyCode}
                saved={saved}
                closeHref={closeHref}
                editHref={hrefFor({
                  order: selected.order.id,
                  edit: "true",
                  saved: undefined,
                })}
                idempotencyKey={randomUUID()}
              />
            ) : (
              <div className="rounded border border-line bg-surface px-3 py-6 text-center">
                <p className="text-[13px] font-medium">
                  That order is not in this business
                </p>
                <p className="mt-1 text-[12px] text-ink-muted">
                  Open an order from the list, or close this panel.
                </p>
                <Link href={closeHref} className={`${BUTTON} mt-3`}>
                  Close panel
                </Link>
              </div>
            )}
          </div>
        ) : null}

        <div className="flex min-w-0 flex-col gap-3">
          {orders.length > 0 ? (
            <PurchaseOrderTable
              orders={orders}
              currency={active.currencyCode}
              selectedId={selectedId}
              rowHref={(orderId) =>
                hrefFor({ order: orderId, saved: undefined })
              }
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
              <Link
                href={filtered ? "/purchase-orders" : hrefFor({ new: "true" })}
                className={`${BUTTON} mt-4`}
              >
                {filtered ? "Clear filters" : "New order"}
              </Link>
            </div>
          )}

          {orders.length === 100 ? (
            <p className="text-[11.5px] text-ink-faint">
              Showing the 100 most recent orders. Filter by status or search to
              narrow the list.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
