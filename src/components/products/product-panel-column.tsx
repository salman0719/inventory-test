"use client";

import { hrefWithPanel, usePanels } from "@/components/panel-host";
import { PanelLoader, PanelNotice } from "@/components/panel-loader";
import type { ProductPanelPayload } from "@/lib/product-panel";
import { DetailPanel } from "../detail-panel";
import { ProductPanel } from "./product-panel";

/**
 * The product panel's column: the shared loader fetches the panel's own payload, so
 * opening a row never re-renders the list. Cost, accepted: on a reload or a shared
 * link the panel arrives in two steps — frame, then data.
 */
export function ProductPanelColumn() {
  const { href, closeHref } = usePanels();
  const params = new URL(href, "http://panel.local").searchParams;
  const editRequested = params.get("edit") === "true";
  const mode =
    params.get("new") === "true" ? "create" : editRequested ? "edit" : "detail";
  const productId = params.get("product") ?? "";
  const saved = params.get("saved") === "true" && !editRequested;
  const query = new URLSearchParams({
    mode,
    product: productId,
    saved: String(saved),
  }).toString();

  return (
    <DetailPanel closeHref={closeHref} label="product details">
      <PanelLoader<ProductPanelPayload>
        key={query}
        url={`/api/products/panel?${query}`}
        label="Loading product details"
        closeHref={closeHref}
        fields={6}
      >
        {(data) =>
          data.product === null && data.mode !== "create" ? (
            <PanelNotice
              title="That product is not in this business"
              body="Open a product from the list, or close this panel."
              closeHref={closeHref}
            />
          ) : (
            <ProductPanel
              mode={data.mode}
              product={data.product}
              categories={data.categories}
              suppliers={data.suppliers}
              currency={data.currency}
              saved={data.saved}
              closeHref={closeHref}
              editHref={
                data.product
                  ? hrefWithPanel(href, {
                      product: data.product.id,
                      edit: "true",
                    })
                  : undefined
              }
              canViewValues={data.canViewValues}
            />
          )
        }
      </PanelLoader>
    </DetailPanel>
  );
}
