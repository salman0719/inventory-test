"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActiveBusiness } from "@/lib/businesses";
import { supplierInputSchema } from "@/lib/supplier-input";
import {
  createSupplier,
  setSupplierArchived as archiveSupplier,
  updateSupplier,
} from "@/lib/suppliers";
import { getSessionUser } from "@/lib/session";

export type SupplierFormState = { error?: string };

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/**
 * Create or update a supplier. The business comes from the session; the form's id
 * is only a lookup key, so another tenant's supplier simply does not match a row.
 */
export async function saveSupplier(
  _previous: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const { active } = await getActiveBusiness(user.id);
  if (!active) return { error: "No business is available to save into." };

  const parsed = supplierInputSchema.safeParse({
    name: formValue(formData, "name"),
    contactName: formValue(formData, "contactName"),
    email: formValue(formData, "email"),
    phone: formValue(formData, "phone"),
    address: formValue(formData, "address"),
    notes: formValue(formData, "notes"),
    leadTimeDays: formValue(formData, "leadTimeDays"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }

  const id = formValue(formData, "id");
  let savedId = id;

  if (id) {
    const updated = await updateSupplier(user.id, active.id, id, parsed.data);
    if (!updated) return { error: "That supplier is not in this business." };
  } else {
    savedId = await createSupplier(user.id, active.id, parsed.data);
  }

  revalidatePath("/suppliers");
  revalidatePath("/products");
  redirect(`/suppliers?supplier=${savedId}&saved=true`);
}

export async function setArchived(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const { active } = await getActiveBusiness(user.id);
  if (!active) return;

  await archiveSupplier(
    user.id,
    active.id,
    formValue(formData, "id"),
    formValue(formData, "archived") === "true",
  );
  revalidatePath("/suppliers");
}
