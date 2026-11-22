"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveBusiness } from "@/lib/businesses";
import { resetDemoData, type ResetCounts } from "@/lib/demo";
import { getSessionUser } from "@/lib/session";

/**
 * Reset demo data for the active business.
 *
 * The business comes from the session, never the form, and the database function
 * re-checks that the caller owns it. The typed word is a deliberate speed bump: the
 * action deletes and rebuilds everything this business holds.
 */

export type ResetState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string; counts: ResetCounts };

const resetSchema = z
  .object({ confirm: z.string().trim() })
  .refine((value) => value.confirm === "RESET", {
    message: "Type RESET to confirm.",
    path: ["confirm"],
  });

export async function resetDemoAction(
  _previous: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const parsed = resetSchema.safeParse({
    confirm: String(formData.get("confirm") ?? ""),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Type RESET to confirm.",
    };
  }

  const user = await getSessionUser();
  if (!user) {
    return { status: "error", message: "Sign in again to reset demo data." };
  }

  const { active } = await getActiveBusiness(user.id);
  if (!active) {
    return { status: "error", message: "Choose a business first." };
  }

  const result = await resetDemoData(user.id, active.id, active.businessType);
  if (!result.ok) {
    return { status: "error", message: result.error };
  }

  revalidatePath("/", "layout");

  return {
    status: "done",
    message: `Demo data restored: ${result.counts.products} products, ${result.counts.suppliers} suppliers, ${result.counts.orders} orders and ${result.counts.movements} opening movements.`,
    counts: result.counts,
  };
}
