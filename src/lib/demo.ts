import { buildResetPayload } from "../../db/seed-demo";
import type { BusinessType } from "./active-business";
import { withTenant } from "./db";

/**
 * Demo data: what is there now, and how to put it back.
 *
 * The reset goes through `private.reset_demo_business`, which holds the owner
 * check and the delete-and-rebuild transaction. The payload comes from the same
 * module `db:seed` uses, so a reset produces the seeded baseline rather than a
 * second, drifting version of it.
 */

export type DemoCounts = {
  products: number;
  categories: number;
  suppliers: number;
  orders: number;
  movements: number;
  receipts: number;
};

export type ResetCounts = {
  categories: number;
  suppliers: number;
  products: number;
  orders: number;
  lines: number;
  movements: number;
};

export type ResetResult =
  { ok: true; counts: ResetCounts } | { ok: false; error: string };

/** The panel is for owners only; the function enforces it regardless. */
export async function canResetDemoData(
  userId: string,
  businessId: string,
): Promise<boolean> {
  return withTenant(userId, async (client) => {
    const result = await client.query<{ role: string }>(
      `select role from business_members
        where business_id = $1 and user_id = $2`,
      [businessId, userId],
    );
    return result.rows[0]?.role === "owner";
  });
}

export async function getDemoCounts(
  userId: string,
  businessId: string,
): Promise<DemoCounts> {
  return withTenant(userId, async (client) => {
    const result = await client.query<DemoCounts>(
      `select
         (select count(*)::int from products p
           where p.business_id = $1 and p.is_archived = false) as products,
         (select count(*)::int from categories c
           where c.business_id = $1) as categories,
         (select count(*)::int from suppliers s
           where s.business_id = $1 and s.is_archived = false) as suppliers,
         (select count(*)::int from purchase_orders po
           where po.business_id = $1) as orders,
         (select count(*)::int from stock_movements m
           where m.business_id = $1) as movements,
         (select count(*)::int from purchase_receipts r
           where r.business_id = $1) as receipts`,
      [businessId],
    );
    return (
      result.rows[0] ?? {
        products: 0,
        categories: 0,
        suppliers: 0,
        orders: 0,
        movements: 0,
        receipts: 0,
      }
    );
  });
}

export async function resetDemoData(
  userId: string,
  businessId: string,
  businessType: BusinessType,
): Promise<ResetResult> {
  // Only the two seeded business types have a demo catalogue to restore.
  if (businessType !== "cafe" && businessType !== "retail") {
    return {
      ok: false,
      error: "This business has no demo dataset to restore.",
    };
  }

  const payload = buildResetPayload(businessType);

  try {
    return await withTenant(userId, async (client) => {
      const result = await client.query<{ reset: ResetCounts }>(
        "select private.reset_demo_business($1, $2::jsonb) as reset",
        [businessId, JSON.stringify(payload)],
      );
      const counts = result.rows[0]?.reset;
      if (!counts) {
        return {
          ok: false as const,
          error: "The demo data was not restored.",
        };
      }
      return { ok: true as const, counts };
    });
  } catch (error) {
    return describeResetError(error);
  }
}

/**
 * Only messages the function raises itself reach the operator; anything else is a
 * bug or a database failure and is rethrown rather than shown as a friendly error.
 */
function describeResetError(error: unknown): ResetResult {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message;

  switch (code) {
    case "42501":
      return {
        ok: false,
        error:
          message ??
          "You do not have permission to reset this business's data.",
      };
    case "22023":
      return {
        ok: false,
        error: message ?? "The demo data could not be restored.",
      };
    case "23503":
    case "23505":
    case "23514":
      return {
        ok: false,
        error: "The demo data could not be restored. Nothing was changed.",
      };
    default:
      throw error;
  }
}
