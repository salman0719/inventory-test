import type { InventoryItem, StockMovement } from "./stock";

/**
 * The stock panel's data contract: the position, its recent ledger lines and the
 * one fact the panel needs from the business (whether money is visible at all).
 */
export type InventoryPanelPayload = {
  /** `null` when the product is not in this business, or was never found. */
  item: InventoryItem | null;
  movements: StockMovement[];
  currency: string;
  canViewValues: boolean;
  saved: boolean;
};
