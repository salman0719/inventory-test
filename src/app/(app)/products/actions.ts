"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getActiveBusiness } from "@/lib/businesses";
import { productInputSchema } from "@/lib/product-input";
import {
  createCategory,
  createProduct,
  isUniqueViolation,
  setProductArchived as archiveProduct,
  updateProduct,
} from "@/lib/products";
import { getSessionUser } from "@/lib/session";

/**
 * Product and category writes.
 *
 * Every action resolves the business from the session, validates the payload with
 * Zod, and lets `withTenant` carry the user id into RLS. The form's `id` is treated
 * as a lookup key, not as authority: a product outside this business simply does
 * not match a row.
 */

export type ProductFormState = { error?: string };
export type CategoryFormState = { error?: string; ok?: boolean };

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function saveProduct(
  _previous: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const { active } = await getActiveBusiness(user.id);
  if (!active) return { error: "No business is available to save into." };

  const parsed = productInputSchema.safeParse({
    name: formValue(formData, "name"),
    sku: formValue(formData, "sku"),
    supplierSku: formValue(formData, "supplierSku"),
    categoryId: formValue(formData, "categoryId"),
    supplierId: formValue(formData, "supplierId"),
    unitOfMeasure: formValue(formData, "unitOfMeasure"),
    costPrice: formValue(formData, "costPrice"),
    sellingPrice: formValue(formData, "sellingPrice"),
    reorderLevel: formValue(formData, "reorderLevel"),
    description: formValue(formData, "description"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }

  const id = formValue(formData, "id");
  let savedId = id;

  try {
    if (id) {
      const updated = await updateProduct(user.id, active.id, id, parsed.data);
      if (!updated) return { error: "That product is not in this business." };
    } else {
      savedId = await createProduct(user.id, active.id, parsed.data);
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      const constraint = (error as { constraint?: string } | null)?.constraint;
      if (constraint === "products_business_supplier_code_key") {
        return {
          error:
            "That supplier code is already used by another product from this supplier.",
        };
      }
      return { error: "That SKU is already used in this business." };
    }
    throw error;
  }

  revalidatePath("/products");
  redirect(`/products?product=${savedId}&saved=true`);
}

export async function setArchived(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const { active } = await getActiveBusiness(user.id);
  if (!active) return;

  await archiveProduct(
    user.id,
    active.id,
    formValue(formData, "id"),
    formValue(formData, "archived") === "true",
  );
  revalidatePath("/products");
}

const categoryNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a category name.")
  .max(60, "Keep the name to 60 characters or fewer.");

export async function addCategory(
  _previous: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const { active } = await getActiveBusiness(user.id);
  if (!active) return { error: "No business is available." };

  const parsed = categoryNameSchema.safeParse(formValue(formData, "name"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the name." };
  }

  try {
    await createCategory(user.id, active.id, parsed.data);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: "That category already exists." };
    }
    throw error;
  }

  revalidatePath("/settings");
  revalidatePath("/products");
  return { ok: true };
}
