"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActiveBusiness } from "@/lib/businesses";
import { getSessionUser } from "@/lib/session";
import { startStocktake, saveStocktake } from "@/lib/stocktake";
import {
  stocktakeCountSchema,
  stocktakeScopeSchema,
} from "@/lib/stocktake-input";

/**
 * Stocktake writes.
 *
 * The form never sends a delta or an on-hand figure: it sends a scope to build a
 * sheet, then counts. The database computes each adjustment from the live ledger
 * and the row it locked, so a stale or tampered count sheet cannot overwrite stock
 * without saying what was actually counted.
 */

export type StocktakeFormState = { error?: string };

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function startStocktakeAction(
  _previous: StocktakeFormState,
  formData: FormData,
): Promise<StocktakeFormState> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const { active } = await getActiveBusiness(user.id);
  if (!active) return { error: "No business is available to count into." };

  const parsed = stocktakeScopeSchema.safeParse({
    categoryId: formValue(formData, "categoryId"),
    search: formValue(formData, "search"),
  });

  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ?? "Check the filters and try again.",
    };
  }

  const result = await startStocktake(user.id, active.id, parsed.data);
  if (!result.ok) return { error: result.error };

  revalidatePath("/stocktake");
  redirect(`/stocktake?session=${result.sessionId}&saved=started`);
}

export async function saveStocktakeAction(
  _previous: StocktakeFormState,
  formData: FormData,
): Promise<StocktakeFormState> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const { active } = await getActiveBusiness(user.id);
  if (!active) return { error: "No business is available to count into." };

  const lineIds = formData
    .getAll("lineId")
    .filter((value): value is string => typeof value === "string");

  const parsed = stocktakeCountSchema.safeParse({
    sessionId: formValue(formData, "sessionId"),
    intent: formValue(formData, "intent"),
    lines: lineIds.map((lineId) => ({
      lineId,
      counted: formValue(formData, `count:${lineId}`),
    })),
  });

  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ?? "Check the counts and try again.",
    };
  }

  const result = await saveStocktake(user.id, active.id, {
    sessionId: parsed.data.sessionId,
    counts: parsed.data.lines,
    complete: parsed.data.intent === "complete",
  });

  if (!result.ok) return { error: result.error };

  revalidatePath("/stocktake");
  revalidatePath("/inventory");
  revalidatePath("/products");
  revalidatePath("/activity");

  const saved = result.completed ? "completed" : "counts";
  redirect(`/stocktake?session=${parsed.data.sessionId}&saved=${saved}`);
}
