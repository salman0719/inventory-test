"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { isPlatformAdmin } from "@/lib/admin";
import {
  approvalSchema,
  decisionErrorCode,
  decisionSchema,
} from "@/lib/admin-input";
import { withTenant } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

/**
 * Approve and reject, as the signed-in admin.
 *
 * Approval is one call to the SECURITY DEFINER function from `0011`: with no target it
 * creates a business and the owner membership, with a target it adds a `staff` or
 * `viewer` membership instead. Repeating an approval returns the business it already
 * produced, so a double-submitted form cannot create two.
 *
 * Errors reach the screen as a short code, and only after the transaction rolled back:
 * `redirect` throws, so it is never called inside the try that catches the decision.
 */

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (!(await isPlatformAdmin(user.id))) notFound();
  return user;
}

function readApproval(formData: FormData) {
  const businessId = formData.get("businessId");
  return approvalSchema.safeParse({
    requestId: formData.get("requestId"),
    businessId:
      typeof businessId === "string" && businessId.trim() !== ""
        ? businessId
        : undefined,
    role: formData.get("role") ?? undefined,
  });
}

export async function approveRegistration(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const parsed = readApproval(formData);
  if (!parsed.success) redirect("/admin/registrations?error=invalid");

  const { requestId, businessId, role } = parsed.data;
  const target = `/admin/registrations/${requestId}`;

  let failure: string | null = null;
  try {
    await withTenant(user.id, async (client) => {
      await client.query("select private.approve_signup_request($1, $2, $3)", [
        requestId,
        businessId ?? null,
        role,
      ]);
    });
  } catch (error) {
    failure = decisionErrorCode(error);
  }

  if (failure) redirect(`${target}?error=${failure}`);

  revalidatePath("/admin");
  revalidatePath("/admin/registrations");
  revalidatePath(target);
  redirect(
    businessId
      ? `${target}?done=approved&as=${role}`
      : `${target}?done=approved`,
  );
}

export async function rejectRegistration(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const raw = formData.get("note");
  const note = typeof raw === "string" ? raw : undefined;
  const parsed = decisionSchema.safeParse({
    requestId: formData.get("requestId"),
    note: note && note.trim() !== "" ? note : undefined,
  });
  if (!parsed.success) redirect("/admin/registrations?error=invalid");

  const id = parsed.data.requestId;
  const target = `/admin/registrations/${id}`;

  let failure: string | null = null;
  try {
    await withTenant(user.id, async (client) => {
      await client.query("select private.reject_signup_request($1, $2)", [
        id,
        parsed.data.note ?? null,
      ]);
    });
  } catch (error) {
    failure = decisionErrorCode(error);
  }

  if (failure) redirect(`${target}?error=${failure}`);

  revalidatePath("/admin");
  revalidatePath("/admin/registrations");
  revalidatePath(target);
  redirect(`${target}?done=rejected`);
}
