"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActiveBusiness } from "@/lib/businesses";
import {
  closeShortSchema,
  isEmptyDeliveryLine,
  purchaseOrderInputSchema,
  receiptSchema,
} from "@/lib/purchase-order-input";
import {
  closePurchaseOrderShort,
  createPurchaseOrder,
  receiveDelivery as recordDelivery,
  setPurchaseOrderStatus,
  updateDraftPurchaseOrder,
} from "@/lib/purchase-orders";
import { getSessionUser } from "@/lib/session";

/**
 * Purchase order writes.
 *
 * The draft's body is validated here and written directly; ordering, cancelling and
 * receiving go through the database functions. The form's order id is a lookup key,
 * never authority: the business always comes from the session.
 */

export type OrderFormState = { error?: string };
export type OrderActionState = { error?: string };

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function formValues(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string");
}

/**
 * The editor posts one productId / quantity / unitCost input per visible row. A row
 * that is entirely empty is an unused row, not a validation error.
 */
function readOrderForm(formData: FormData) {
  const productIds = formValues(formData, "productId");
  const quantities = formValues(formData, "quantity");
  const unitCosts = formValues(formData, "unitCost");

  const lines = productIds
    .map((productId, index) => ({
      productId,
      quantity: quantities[index] ?? "",
      unitCost: unitCosts[index] ?? "",
    }))
    .filter(
      (line) =>
        line.productId.trim() !== "" ||
        line.quantity.trim() !== "" ||
        line.unitCost.trim() !== "",
    );

  return {
    supplierId: formValue(formData, "supplierId"),
    expectedDeliveryAt: formValue(formData, "expectedDeliveryAt"),
    notes: formValue(formData, "notes"),
    lines,
  };
}

export async function saveOrder(
  _previous: OrderFormState,
  formData: FormData,
): Promise<OrderFormState> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const { active } = await getActiveBusiness(user.id);
  if (!active) return { error: "No business is available to save into." };

  const parsed = purchaseOrderInputSchema.safeParse(readOrderForm(formData));
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ?? "Check the order and try again.",
    };
  }

  const id = formValue(formData, "id");
  const result = id
    ? await updateDraftPurchaseOrder(user.id, active.id, id, parsed.data)
    : await createPurchaseOrder(user.id, active.id, parsed.data);

  if (!result.ok) return { error: result.error };

  revalidatePath("/purchase-orders");
  redirect(`/purchase-orders?order=${result.id}&saved=true`);
}

export async function markOrdered(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const { active } = await getActiveBusiness(user.id);
  if (!active) return { error: "No business is available." };

  const orderId = formValue(formData, "id");
  const result = await setPurchaseOrderStatus(
    user.id,
    active.id,
    orderId,
    "ordered",
  );
  if (!result.ok) return { error: result.error };

  revalidatePath("/purchase-orders");
  redirect(`/purchase-orders?order=${orderId}&saved=ordered`);
}

export async function cancelOrder(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const { active } = await getActiveBusiness(user.id);
  if (!active) return { error: "No business is available." };

  const orderId = formValue(formData, "id");
  const result = await setPurchaseOrderStatus(
    user.id,
    active.id,
    orderId,
    "cancelled",
  );
  if (!result.ok) return { error: result.error };

  revalidatePath("/purchase-orders");
  redirect(`/purchase-orders?order=${orderId}&saved=cancelled`);
}

export async function recordReceipt(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const { active } = await getActiveBusiness(user.id);
  if (!active) return { error: "No business is available." };

  const lineIds = formValues(formData, "lineId");
  const accepted = formValues(formData, "accepted");
  const damaged = formValues(formData, "damaged");
  const rejected = formValues(formData, "rejected");
  const reasons = formValues(formData, "reason");
  // A line the operator left at zero arrived nowhere and stays off the receipt.
  const lines = lineIds
    .map((lineId, index) => ({
      lineId,
      accepted: accepted[index] ?? "",
      damaged: damaged[index] ?? "",
      rejected: rejected[index] ?? "",
      reason: reasons[index] ?? "",
    }))
    .filter((line) => !isEmptyDeliveryLine(line));

  const parsed = receiptSchema.safeParse({
    orderId: formValue(formData, "orderId"),
    idempotencyKey: formValue(formData, "idempotencyKey"),
    lines,
  });
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ?? "Check the delivery and try again.",
    };
  }

  const result = await recordDelivery(user.id, active.id, parsed.data);
  if (!result.ok) return { error: result.error };

  revalidatePath("/purchase-orders");
  revalidatePath("/inventory");
  redirect(
    `/purchase-orders?order=${parsed.data.orderId}&saved=${result.status}`,
  );
}

/**
 * Writes off what is still outstanding on a partly received order. The delivered
 * quantities stay as they were; only the status and the reason change.
 */
export async function closeShortOrder(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const { active } = await getActiveBusiness(user.id);
  if (!active) return { error: "No business is available." };

  const parsed = closeShortSchema.safeParse({
    orderId: formValue(formData, "id"),
    reason: formValue(formData, "reason"),
  });
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ?? "Check the order and try again.",
    };
  }

  const result = await closePurchaseOrderShort(
    user.id,
    active.id,
    parsed.data.orderId,
    parsed.data.reason,
  );
  if (!result.ok) return { error: result.error };

  revalidatePath("/purchase-orders");
  redirect(`/purchase-orders?order=${parsed.data.orderId}&saved=closed_short`);
}
