import type { SuppliedProduct, SupplierSummary } from "./suppliers";

/**
 * The supplier panel's data contract: the supplier, the first slice of its
 * catalogue, and whether this is a form or a read-only view.
 */
export type SupplierPanelPayload = {
  mode: "create" | "edit" | "detail";
  /** `null` when the supplier is not in this business, or was never found. */
  supplier: SupplierSummary | null;
  products: SuppliedProduct[];
  saved: boolean;
};
