"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { isPlatformAdmin } from "@/lib/admin";
import {
  approvalSchema,
  confirmAccountSchema,
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

/**
 * Vouch for an address the applicant never proved.
 *
 * `private.confirm_account` sets `auth.users.email_confirmed_at` and, in the same
 * transaction, files the registration the sign-up metadata already carries. Filing is
 * what makes the account approvable: approval needs a request row, and with
 * confirmation on nothing else writes one. An account with no answers is confirmed
 * and reports that the queue did not change.
 */
export async function confirmAccount(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const parsed = confirmAccountSchema.safeParse({
    accountId: formData.get("accountId"),
  });
  if (!parsed.success) redirect("/admin/accounts?error=invalid");

  let failure: string | null = null;
  let filed = false;
  try {
    filed = await withTenant(user.id, async (client) => {
      const result = await client.query<{
        confirmed: { requestFiled: boolean } | null;
      }>("select private.confirm_account($1) as confirmed", [
        parsed.data.accountId,
      ]);
      return result.rows[0]?.confirmed?.requestFiled === true;
    });
  } catch (error) {
    failure = decisionErrorCode(error);
  }

  if (failure) redirect(`/admin/accounts?error=${failure}`);

  revalidatePath("/admin");
  revalidatePath("/admin/accounts");
  revalidatePath("/admin/registrations");
  redirect(`/admin/accounts?done=confirmed${filed ? "&filed=1" : ""}`);
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
