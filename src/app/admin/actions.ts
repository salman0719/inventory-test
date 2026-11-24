"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import type { PoolClient } from "pg";
import { isPlatformAdmin } from "@/lib/admin";
import { decisionErrorCode, decisionSchema } from "@/lib/admin-input";
import { withTenant } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

/**
 * Approve and reject, as the signed-in admin.
 *
 * The work is one call to the SECURITY DEFINER function from `0008`: it creates the
 * business and the owner membership in a single transaction, or refuses because the
 * request is already rejected. Repeating an approval returns the business it already
 * made, so a double-submitted form cannot create two.
 *
 * Failures reach the screen as a short code, never as SQL text.
 */

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (!(await isPlatformAdmin(user.id))) notFound();
  return user;
}

function readDecision(formData: FormData) {
  const raw = formData.get("note");
  const note = typeof raw === "string" ? raw : undefined;
  return decisionSchema.safeParse({
    requestId: formData.get("requestId"),
    note: note && note.trim() !== "" ? note : undefined,
  });
}

async function decide(
  formData: FormData,
  run: (client: PoolClient, id: string, note: string | null) => Promise<void>,
  done: "approved" | "rejected",
): Promise<void> {
  const user = await requireAdmin();
  const parsed = readDecision(formData);
  if (!parsed.success) redirect("/admin/registrations?error=invalid");

  const id = parsed.data.requestId;
  const target = `/admin/registrations/${id}`;

  // `redirect` throws, so it must not be called inside this try: the catch would
  // swallow the navigation instead of reporting a decision failure.
  let failure: string | null = null;
  try {
    await withTenant(user.id, (client) =>
      run(client, id, parsed.data.note ?? null),
    );
  } catch (error) {
    failure = decisionErrorCode(error);
  }

  if (failure) redirect(`${target}?error=${failure}`);

  revalidatePath("/admin");
  revalidatePath("/admin/registrations");
  revalidatePath(target);
  redirect(`${target}?done=${done}`);
}

export async function approveRegistration(formData: FormData): Promise<void> {
  await decide(
    formData,
    async (client, id) => {
      await client.query("select private.approve_signup_request($1)", [id]);
    },
    "approved",
  );
}

export async function rejectRegistration(formData: FormData): Promise<void> {
  await decide(
    formData,
    async (client, id, note) => {
      await client.query("select private.reject_signup_request($1, $2)", [
        id,
        note,
      ]);
    },
    "rejected",
  );
}
