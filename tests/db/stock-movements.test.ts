import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { databaseUrl } from "../../db/env";

/**
 * The stock movement function cannot be checked with a mock: these tests act as
 * `authenticated` with a JWT subject, exactly as the app does, and rely on the
 * function's own membership, role and non-negative checks.
 *
 * Each `asUser` block rolls back, so tests start from the same 10-unit opening
 * balance. The concurrency test is the exception: it must commit to release the
 * product lock, and cleans up through the business cascade in `afterAll`.
 */
const pool = new Pool({ connectionString: databaseUrl(), max: 4 });

const ids = {
  business: randomUUID(),
  otherBusiness: randomUUID(),
  owner: randomUUID(),
  staff: randomUUID(),
  viewer: randomUUID(),
  stranger: randomUUID(),
  otherOwner: randomUUID(),
  product: randomUUID(),
  otherProduct: randomUUID(),
};

async function asUser<T>(
  userId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId }),
    ]);
    return await fn(client);
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
  }
}

function record(
  client: PoolClient,
  productId: string,
  movementType: string,
  delta: string,
  reason: string | null,
) {
  return client.query<{ movement_id: string; on_hand: string }>(
    `select movement_id, on_hand::text
       from private.record_stock_movement($1, $2, $3::numeric, $4)`,
    [productId, movementType, delta, reason],
  );
}

async function movementCount(client: PoolClient, productId: string) {
  const result = await client.query<{ n: number }>(
    "select count(*)::int as n from stock_movements where product_id = $1",
    [productId],
  );
  return result.rows[0]?.n ?? 0;
}

/** The rejection message, so two different failures can be compared. */
async function recordError(userId: string, productId: string): Promise<string> {
  return asUser(userId, async (client) => {
    try {
      await record(client, productId, "stock_in", "1", null);
      return "";
    } catch (error) {
      return (error as { message?: string }).message ?? "";
    }
  });
}

beforeAll(async () => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into businesses (id, name, business_type)
       values ($1, 'Ledger Cafe', 'cafe'), ($2, 'Ledger Shop', 'retail')`,
      [ids.business, ids.otherBusiness],
    );
    await client.query(
      `insert into auth.users (id, email) values
         ($1, $2), ($3, $4), ($5, $6), ($7, $8), ($9, $10)`,
      [
        ids.owner,
        `ledger-owner-${ids.business}@test.invalid`,
        ids.staff,
        `ledger-staff-${ids.business}@test.invalid`,
        ids.viewer,
        `ledger-viewer-${ids.business}@test.invalid`,
        ids.stranger,
        `ledger-stranger-${ids.stranger}@test.invalid`,
        ids.otherOwner,
        `ledger-owner-${ids.otherBusiness}@test.invalid`,
      ],
    );
    await client.query(
      `insert into business_members (business_id, user_id, role) values
         ($1, $2, 'owner'), ($1, $3, 'staff'), ($1, $4, 'viewer'),
         ($5, $6, 'owner')`,
      [
        ids.business,
        ids.owner,
        ids.staff,
        ids.viewer,
        ids.otherBusiness,
        ids.otherOwner,
      ],
    );
    await client.query(
      `insert into products (id, business_id, name, sku, unit_of_measure, cost_price, reorder_level)
       values ($1, $2, 'Coffee beans', 'BEANS-1', 'kg', 28.00, 4),
              ($3, $4, 'Other beans', 'BEANS-2', 'kg', 20.00, 2)`,
      [ids.product, ids.business, ids.otherProduct, ids.otherBusiness],
    );
    await client.query(
      `insert into stock_movements (business_id, product_id, movement_type, quantity_delta, reason)
       values ($1, $2, 'opening', 10, 'Opening balance'),
              ($3, $4, 'opening', 10, 'Opening balance')`,
      [ids.business, ids.product, ids.otherBusiness, ids.otherProduct],
    );
    await client.query("commit");
  } finally {
    client.release();
  }
});

afterAll(async () => {
  await pool.query("delete from businesses where id = any($1::uuid[])", [
    [ids.business, ids.otherBusiness],
  ]);
  await pool.query("delete from auth.users where id = any($1::uuid[])", [
    [ids.owner, ids.staff, ids.viewer, ids.stranger, ids.otherOwner],
  ]);
  await pool.end();
});

describe("record_stock_movement", () => {
  it("adds stock and returns the new on-hand", async () => {
    const result = await asUser(ids.owner, async (client) => {
      const inserted = await record(
        client,
        ids.product,
        "stock_in",
        "5",
        "Delivery",
      );
      const rows = await client.query<{
        movement_type: string;
        quantity_delta: string;
        reference_type: string;
        created_by: string | null;
      }>(
        `select movement_type, quantity_delta::text as quantity_delta,
                reference_type, created_by
           from stock_movements
          where product_id = $1 and movement_type = 'stock_in'`,
        [ids.product],
      );
      return { onHand: inserted.rows[0]?.on_hand, movement: rows.rows[0] };
    });

    expect(Number(result.onHand)).toBe(15);
    expect(result.movement).toMatchObject({
      movement_type: "stock_in",
      quantity_delta: "5.000",
      reference_type: "manual",
      created_by: ids.owner,
    });
  });

  it("lets staff remove stock", async () => {
    const onHand = await asUser(ids.staff, async (client) => {
      const result = await record(client, ids.product, "stock_out", "-3", null);
      return result.rows[0]?.on_hand;
    });

    expect(Number(onHand)).toBe(7);
  });

  it("records an adjustment with its reason", async () => {
    const result = await asUser(ids.owner, async (client) => {
      const adjusted = await record(
        client,
        ids.product,
        "adjustment",
        "-2",
        "Broken bag",
      );
      const reason = await client.query<{ reason: string }>(
        `select reason from stock_movements
          where product_id = $1 and movement_type = 'adjustment'`,
        [ids.product],
      );
      return {
        onHand: adjusted.rows[0]?.on_hand,
        reason: reason.rows[0]?.reason,
      };
    });

    expect(Number(result.onHand)).toBe(8);
    expect(result.reason).toBe("Broken bag");
  });

  it("rejects an adjustment without a reason", async () => {
    await expect(
      asUser(ids.owner, (client) =>
        record(client, ids.product, "adjustment", "-1", "   "),
      ),
    ).rejects.toMatchObject({ code: "22023" });
  });

  it("rejects a type the manual form does not offer", async () => {
    await expect(
      asUser(ids.owner, (client) =>
        record(client, ids.product, "opening", "1", null),
      ),
    ).rejects.toMatchObject({ code: "22023" });
  });

  it("rejects a zero quantity", async () => {
    await expect(
      asUser(ids.owner, (client) =>
        record(client, ids.product, "stock_in", "0", null),
      ),
    ).rejects.toMatchObject({ code: "22023" });
  });

  it("refuses to take stock below zero and writes nothing", async () => {
    await expect(
      asUser(ids.owner, (client) =>
        record(client, ids.product, "stock_out", "-11", null),
      ),
    ).rejects.toMatchObject({ code: "23514" });

    const after = await asUser(ids.owner, async (client) => {
      const stock = await client.query<{ on_hand: string }>(
        "select on_hand::text from product_stock where product_id = $1",
        [ids.product],
      );
      return {
        onHand: stock.rows[0]?.on_hand,
        movements: await movementCount(client, ids.product),
      };
    });

    expect(Number(after.onHand)).toBe(10);
    expect(after.movements).toBe(1);
  });

  it("refuses a viewer", async () => {
    await expect(
      asUser(ids.viewer, (client) =>
        record(client, ids.product, "stock_in", "1", null),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("refuses a signed-in user with no membership", async () => {
    await expect(
      asUser(ids.stranger, (client) =>
        record(client, ids.product, "stock_in", "1", null),
      ),
    ).rejects.toMatchObject({ code: "P0002" });
  });

  it("does not reveal whether another business's product exists", async () => {
    const missing = await recordError(ids.owner, randomUUID());
    const foreign = await recordError(ids.owner, ids.otherProduct);

    expect(missing).toBe("That product is not in this business.");
    expect(foreign).toBe(missing);
  });

  it("serialises two movements so stock cannot go below zero", async () => {
    const first = await pool.connect();
    const second = await pool.connect();
    try {
      for (const client of [first, second]) {
        await client.query("begin");
        await client.query("set local role authenticated");
        await client.query(
          "select set_config('request.jwt.claims', $1, true)",
          [JSON.stringify({ sub: ids.owner })],
        );
      }

      const taken = await record(first, ids.product, "stock_out", "-8", null);
      expect(Number(taken.rows[0]?.on_hand)).toBe(2);

      const blocked = record(second, ids.product, "stock_out", "-8", null).then(
        () => ({ ok: true as const }),
        (error: { code?: string }) => ({
          ok: false as const,
          code: error.code,
        }),
      );

      // The second call is waiting on the product row lock the first holds.
      await new Promise((resolve) => setTimeout(resolve, 150));
      await first.query("commit");

      const outcome = await blocked;
      await second.query("rollback");

      expect(outcome).toEqual({ ok: false, code: "23514" });
    } finally {
      first.release();
      second.release();
    }
  });
});
