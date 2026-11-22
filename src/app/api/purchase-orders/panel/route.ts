import { randomUUID } from "node:crypto";
import { getActiveBusiness } from "@/lib/businesses";
import {
  orderPanelRequestSchema,
  type OrderPanelPayload,
} from "@/lib/order-panel";
import { quantityField } from "@/lib/purchase-order-input";
import { getOrderFormOptions, getPurchaseOrder } from "@/lib/purchase-orders";
import { getSessionUser } from "@/lib/session";

/**
 * One order panel, as JSON, for a row click that must not re-render the list.
 *
 * An `edit` request for an order that is no longer a draft falls back to the detail
 * view rather than opening an editor the actions would refuse.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json(
      { error: "Sign in to open purchase orders." },
      { status: 401 },
    );
  }

  const { active } = await getActiveBusiness(user.id);
  if (!active) {
    return Response.json(
      { error: "No business is selected." },
      { status: 404 },
    );
  }

  const params = new URL(request.url).searchParams;
  const parsed = orderPanelRequestSchema.safeParse({
    mode: params.get("mode") ?? "detail",
    id: params.get("order") ?? "",
    saved: params.get("saved") ?? "",
  });

  if (!parsed.success) {
    return Response.json(
      { error: "Unsupported panel request." },
      { status: 400 },
    );
  }

  const { mode, id: orderId, saved } = parsed.data;
  const detail =
    mode === "create" || orderId === ""
      ? null
      : await getPurchaseOrder(user.id, active.id, orderId);

  const editingDraft =
    detail !== null && detail.order.status === "draft" && mode === "edit";
  const resolvedMode =
    mode === "create" ? "create" : editingDraft ? "edit" : "detail";
  const options =
    resolvedMode === "detail"
      ? null
      : await getOrderFormOptions(user.id, active.id);

  const defaults =
    options === null
      ? null
      : editingDraft && detail
        ? {
            id: detail.order.id,
            supplierId: detail.order.supplierId,
            expectedDeliveryAt: detail.order.expectedDeliveryAt ?? "",
            notes: detail.order.notes ?? "",
            lines: detail.lines.map((line) => ({
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

  const payload: OrderPanelPayload = {
    mode: resolvedMode,
    detail,
    options,
    defaults,
    currency: active.currencyCode,
    canViewValues: active.role !== "viewer",
    saved: resolvedMode === "detail" ? saved : "",
    idempotencyKey: randomUUID(),
  };

  return Response.json(payload, {
    headers: { "cache-control": "private, no-store" },
  });
}
