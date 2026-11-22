"use client";

import { hrefWithPanel, usePanels } from "@/components/panel-host";
import { PanelLoader, PanelNotice } from "@/components/panel-loader";
import { PanelLink } from "@/components/panel-link";
import type { OrderPanelPayload } from "@/lib/order-panel";
import { DetailPanel } from "../detail-panel";
import { PurchaseOrderForm } from "./purchase-order-form";
import { PurchaseOrderPanel } from "./purchase-order-panel";

const BUTTON =
  "inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-2.5 text-[12px] font-medium hover:border-accent hover:text-accent";

/**
 * The order panel's column, on the shared loader: draft editor or received/ordered
 * detail, fetched on its own so a row click never re-renders the list.
 */
export function OrderPanelColumn() {
  const { href, closeHref } = usePanels();
  const params = new URL(href, "http://panel.local").searchParams;
  const mode =
    params.get("new") === "true"
      ? "create"
      : params.get("edit") === "true"
        ? "edit"
        : "detail";
  const orderId = params.get("order") ?? "";
  const saved = params.get("saved") ?? "";
  const query = new URLSearchParams({
    mode,
    order: orderId,
    saved,
  }).toString();

  return (
    <DetailPanel closeHref={closeHref} label="order details">
      <PanelLoader<OrderPanelPayload>
        key={query}
        url={`/api/purchase-orders/panel?${query}`}
        label="Loading order details"
        closeHref={closeHref}
      >
        {(data) => {
          if (data.mode === "create" || data.mode === "edit") {
            if (data.options === null || data.defaults === null) {
              return (
                <PanelNotice
                  title="The order form could not be opened"
                  body="Close the panel and try again."
                  closeHref={closeHref}
                />
              );
            }
            return (
              <div className="rounded border border-line bg-surface">
                <header className="flex items-center gap-2 border-b border-line px-3 py-2">
                  <h2 className="min-w-0 truncate text-[13px] font-semibold">
                    {data.mode === "edit" && data.detail
                      ? `Edit ${data.detail.order.orderNumber}`
                      : "New purchase order"}
                  </h2>
                  <PanelLink
                    href={closeHref}
                    aria-label="Close order panel"
                    className={`${BUTTON} ml-auto shrink-0`}
                  >
                    Close
                  </PanelLink>
                </header>
                <div className="px-3 py-3">
                  <PurchaseOrderForm
                    mode={data.mode}
                    suppliers={data.options.suppliers}
                    products={data.options.products}
                    defaults={data.defaults}
                    cancelHref={closeHref}
                  />
                </div>
              </div>
            );
          }

          if (data.detail === null) {
            return (
              <PanelNotice
                title="That order is not in this business"
                body="Open an order from the list, or close this panel."
                closeHref={closeHref}
              />
            );
          }

          return (
            <PurchaseOrderPanel
              detail={data.detail}
              currency={data.currency}
              saved={data.saved}
              closeHref={closeHref}
              editHref={
                hrefWithPanel(href, {
                  order: data.detail.order.id,
                  edit: "true",
                  saved: null,
                }) ?? closeHref
              }
              idempotencyKey={data.idempotencyKey}
              canViewValues={data.canViewValues}
            />
          );
        }}
      </PanelLoader>
    </DetailPanel>
  );
}
