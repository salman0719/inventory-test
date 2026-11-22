"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActiveBusiness } from "@/lib/businesses";
import { getSessionUser } from "@/lib/session";
import { stockMovementSchema } from "@/lib/stock-input";
import { recordStockMovement } from "@/lib/stock";

/**
 * Stock writes.
 *
 * The form can only ask for a movement; it cannot set an on-hand figure. The
 * business comes from the session and the ledger is appended inside the database
 * function, so a stale form or a double submit cannot overwrite a quantity.
 */

export type MovementFormState = { error?: string };

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function recordMovement(
  _previous: MovementFormState,
  formData: FormData,
): Promise<MovementFormState> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const { active } = await getActiveBusiness(user.id);
  if (!active) return { error: "No business is available to record into." };

  const parsed = stockMovementSchema.safeParse({
    productId: formValue(formData, "productId"),
    movementType: formValue(formData, "movementType"),
    direction: formValue(formData, "direction") || undefined,
    quantity: formValue(formData, "quantity"),
    reason: formValue(formData, "reason"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }

  const result = await recordStockMovement(user.id, active.id, parsed.data);
  if (!result.ok) return { error: result.error };

  revalidatePath("/inventory");
  revalidatePath("/products");
  redirect(`/inventory?product=${parsed.data.productId}&saved=true`);
}
