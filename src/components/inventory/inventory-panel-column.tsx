"use client";

import { usePanels } from "@/components/panel-host";
import { PanelLoader, PanelNotice } from "@/components/panel-loader";
import type { InventoryPanelPayload } from "@/lib/inventory-panel";
import { DetailPanel } from "../detail-panel";
import { InventoryPanel } from "./inventory-panel";

/** The stock panel's column, on the shared loader. */
export function InventoryPanelColumn() {
  const { href, closeHref } = usePanels();
  const params = new URL(href, "http://panel.local").searchParams;
  const productId = params.get("product") ?? "";
  const saved = params.get("saved") === "true";
  const query = new URLSearchParams({
    mode: "detail",
    product: productId,
    saved: String(saved),
  }).toString();

  return (
    <DetailPanel closeHref={closeHref} label="stock details">
      <PanelLoader<InventoryPanelPayload>
        key={query}
        url={`/api/inventory/panel?${query}`}
        label="Loading stock details"
        closeHref={closeHref}
        lead
      >
        {(data) =>
          data.item === null ? (
            <PanelNotice
              title="That product is not in this business"
              body="Open a product from the list, or close this panel."
              closeHref={closeHref}
            />
          ) : (
            <InventoryPanel
              item={data.item}
              movements={data.movements}
              currency={data.currency}
              saved={data.saved}
              closeHref={closeHref}
              canViewValues={data.canViewValues}
            />
          )
        }
      </PanelLoader>
    </DetailPanel>
  );
}
