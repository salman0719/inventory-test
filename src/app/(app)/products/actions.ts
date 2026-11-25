"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getActiveBusiness } from "@/lib/businesses";
import {
  productInputSchema,
  productSupplierLinkInputSchema,
  productSupplierLinkRefSchema,
} from "@/lib/product-input";
import {
  addProductSupplier,
  createCategory,
  createProduct,
  getProductPriceHistory,
  isUniqueViolation,
  removeProductSupplier,
  setDefaultProductSupplier,
  setProductArchived as archiveProduct,
  setProductCost,
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
export type SupplierLinkFormState = { error?: string };

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** A link change moves the product between supplier screens and order options. */
function revalidateSupplierLinks(productId: string): never {
  revalidatePath("/products");
  revalidatePath("/reorder");
  revalidatePath("/purchase-orders");
  redirect(`/products?product=${productId}&saved=true`);
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
    barcode: formValue(formData, "barcode"),
    supplierSku: formValue(formData, "supplierSku"),
    categoryId: formValue(formData, "categoryId"),
    supplierId: formValue(formData, "supplierId"),
    unitOfMeasure: formValue(formData, "unitOfMeasure"),
    costPrice: formValue(formData, "costPrice"),
    sellingPrice: formValue(formData, "sellingPrice"),
    reorderLevel: formValue(formData, "reorderLevel"),
    targetStockLevel: formValue(formData, "targetStockLevel"),
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
      if (constraint === "product_suppliers_code_key") {
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

/**
 * Copy the last paid price into the catalogue cost, on the operator's say-so.
 *
 * Deliberately an explicit action rather than an automatic rewrite on receipt:
 * cost_price is the valuation figure, and a delivery that arrived at a one-off
 * price should not silently revalue stock. Past receipts keep their own cost.
 */
export async function useLastPaidCost(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const { active } = await getActiveBusiness(user.id);
  if (!active) redirect("/products");

  const parsed = z
    .object({ productId: z.uuid() })
    .safeParse({ productId: formValue(formData, "productId") });

  if (!parsed.success) redirect("/products");

  const { productId } = parsed.data;
  // The amount is never taken from the form. "Last paid" is evidence in the
  // receipts, so the server derives it from the same view the panel reads, and a
  // crafted post can only name a product in this business.
  const { lastPaid } = await getProductPriceHistory(
    user.id,
    active.id,
    productId,
  );
  if (lastPaid === null) redirect(`/products?product=${productId}`);

  const updated = await setProductCost(
    user.id,
    active.id,
    productId,
    lastPaid.unitCost,
  );
  if (!updated) redirect("/products");

  revalidatePath("/products");
  redirect(`/products?product=${productId}&saved=true`);
}

export async function addSupplierLink(
  _previous: SupplierLinkFormState,
  formData: FormData,
): Promise<SupplierLinkFormState> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const { active } = await getActiveBusiness(user.id);
  if (!active) return { error: "No business is available." };

  const parsed = productSupplierLinkInputSchema.safeParse({
    productId: formValue(formData, "productId"),
    supplierId: formValue(formData, "supplierId"),
    supplierSku: formValue(formData, "supplierSku"),
    leadTimeDays: formValue(formData, "leadTimeDays"),
  });
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ?? "Check the supplier and try again.",
    };
  }

  let result;
  try {
    result = await addProductSupplier(
      user.id,
      active.id,
      parsed.data.productId,
      parsed.data,
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      const constraint = (error as { constraint?: string } | null)?.constraint;
      return {
        error:
          constraint === "product_suppliers_code_key"
            ? "That supplier code is already used by another product from this supplier."
            : "That supplier is already linked to this product.",
      };
    }
    throw error;
  }
  if (!result.ok) return { error: result.error };

  return revalidateSupplierLinks(parsed.data.productId);
}

export async function removeSupplierLink(
  _previous: SupplierLinkFormState,
  formData: FormData,
): Promise<SupplierLinkFormState> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const { active } = await getActiveBusiness(user.id);
  if (!active) return { error: "No business is available." };

  const parsed = productSupplierLinkRefSchema.safeParse({
    productId: formValue(formData, "productId"),
    linkId: formValue(formData, "linkId"),
  });
  if (!parsed.success) return { error: "Reload the product and try again." };

  const result = await removeProductSupplier(
    user.id,
    active.id,
    parsed.data.productId,
    parsed.data.linkId,
  );
  if (!result.ok) return { error: result.error };

  return revalidateSupplierLinks(parsed.data.productId);
}

export async function makeDefaultSupplier(
  _previous: SupplierLinkFormState,
  formData: FormData,
): Promise<SupplierLinkFormState> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const { active } = await getActiveBusiness(user.id);
  if (!active) return { error: "No business is available." };

  const parsed = productSupplierLinkRefSchema.safeParse({
    productId: formValue(formData, "productId"),
    linkId: formValue(formData, "linkId"),
  });
  if (!parsed.success) return { error: "Reload the product and try again." };

  const result = await setDefaultProductSupplier(
    user.id,
    active.id,
    parsed.data.productId,
    parsed.data.linkId,
  );
  if (!result.ok) return { error: result.error };

  return revalidateSupplierLinks(parsed.data.productId);
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
