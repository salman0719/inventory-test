"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActiveBusiness } from "@/lib/businesses";
import { saveReorderSelection } from "@/lib/reorder";
import { reorderSelectionSchema } from "@/lib/reorder-input";
import { getSessionUser } from "@/lib/session";

/**
 * Create or extend a supplier's draft from the reorder screen.
 *
 * The supplier and the business come from the form and the session respectively;
 * the selection is validated here and again by the write path. A viewer is refused
 * before the database has to do it, and any database refusal is returned as a
 * sentence the operator can act on.
 */

export type ReorderFormState = { error?: string };

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function createReorderDraft(
  _previous: ReorderFormState,
  formData: FormData,
): Promise<ReorderFormState> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const { active } = await getActiveBusiness(user.id);
  if (!active) return { error: "No business is available to order into." };

  if (active.role === "viewer") {
    return { error: "Only owners and staff can create orders." };
  }

  const selected = formData
    .getAll("product")
    .filter((value): value is string => typeof value === "string");

  const parsed = reorderSelectionSchema.safeParse({
    supplierId: formValue(formData, "supplierId"),
    lines: selected.map((productId) => ({
      productId,
      quantity: formValue(formData, `quantity:${productId}`),
    })),
  });

  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ??
        "Check the quantities and try again.",
    };
  }

  const result = await saveReorderSelection(user.id, active.id, parsed.data);
  if (!result.ok) return { error: result.error };

  revalidatePath("/reorder");
  revalidatePath("/purchase-orders");
  redirect(`/purchase-orders?order=${result.orderId}&saved=true`);
}
