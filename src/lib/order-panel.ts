import { z } from "zod";
import type { OrderFormDefaults } from "@/components/purchase-orders/purchase-order-form";
import type { OrderFormOptions, PurchaseOrderDetail } from "./purchase-orders";

/**
 * The order panel's data contract.
 *
 * Orders differ from the other panels in one way: `saved` is not a boolean. It is
 * the word the action redirects with (`ordered`, `cancelled`, `partially_received`),
 * and the panel turns that word into the sentence an operator needs. So this
 * endpoint validates its own request rather than the shared one.
 */
export const orderPanelRequestSchema = z.object({
  mode: z.enum(["create", "edit", "detail"]),
  id: z.string().trim().max(64).default(""),
  saved: z.string().max(24).default(""),
});

export type OrderPanelPayload = {
  /** `edit` only when the order is still a draft; otherwise it resolves to detail. */
  mode: "create" | "edit" | "detail";
  /** `null` when the order is not in this business, or was never found. */
  detail: PurchaseOrderDetail | null;
  options: OrderFormOptions | null;
  defaults: OrderFormDefaults | null;
  currency: string;
  canViewValues: boolean;
  saved: string;
  /** Recomputed per request, so a replay of one delivery cannot post stock twice. */
  idempotencyKey: string;
};
