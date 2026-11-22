"use client";

import { hrefWithPanel, usePanels } from "@/components/panel-host";
import { PanelLoader, PanelNotice } from "@/components/panel-loader";
import type { SupplierPanelPayload } from "@/lib/supplier-panel";
import { DetailPanel } from "../detail-panel";
import { SupplierPanel } from "./supplier-panel";

/** The supplier panel's column, on the shared loader. */
export function SupplierPanelColumn() {
  const { href, closeHref } = usePanels();
  const params = new URL(href, "http://panel.local").searchParams;
  const editRequested = params.get("edit") === "true";
  const mode =
    params.get("new") === "true" ? "create" : editRequested ? "edit" : "detail";
  const supplierId = params.get("supplier") ?? "";
  const saved = params.get("saved") === "true" && !editRequested;
  const query = new URLSearchParams({
    mode,
    supplier: supplierId,
    saved: String(saved),
  }).toString();

  return (
    <DetailPanel closeHref={closeHref} label="supplier details">
      <PanelLoader<SupplierPanelPayload>
        key={query}
        url={`/api/suppliers/panel?${query}`}
        label="Loading supplier details"
        closeHref={closeHref}
      >
        {(data) =>
          data.supplier === null && data.mode !== "create" ? (
            <PanelNotice
              title="That supplier is not in this business"
              body="Open a supplier from the list, or close this panel."
              closeHref={closeHref}
            />
          ) : (
            <SupplierPanel
              mode={data.mode}
              supplier={data.supplier}
              products={data.products}
              saved={data.saved}
              closeHref={closeHref}
              editHref={
                data.supplier
                  ? hrefWithPanel(href, {
                      supplier: data.supplier.id,
                      edit: "true",
                    })
                  : undefined
              }
            />
          )
        }
      </PanelLoader>
    </DetailPanel>
  );
}
