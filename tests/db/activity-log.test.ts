import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { databaseUrl } from "../../db/env";

/**
 * The activity log against real Postgres as `authenticated`.
 *
 * What matters here is not the insert but the boundary: the log is append-only, a
 * viewer cannot write it, another tenant cannot see or read it, and an event only
 * survives when the change it describes committed with it.
 */
const pool = new Pool({ connectionString: databaseUrl(), max: 4 });

const ids = {
  business: randomUUID(),
  otherBusiness: randomUUID(),
  owner: randomUUID(),
  staff: randomUUID(),
  viewer: randomUUID(),
  otherOwner: randomUUID(),
  supplier: randomUUID(),
  product: randomUUID(),
};

const ownerEmail = `activity-owner-${ids.business}@test.invalid`;

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

/** Committed so another session can see the rows, as a real action would leave them. */
async function asUserCommitted<T>(
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
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function captureError(
  client: PoolClient,
  run: () => Promise<unknown>,
): Promise<{ code?: string; message: string }> {
  try {
    await run();
  } catch (error) {
    const failure = error as { code?: string; message?: string };
    return { code: failure.code, message: failure.message ?? "" };
  }
  throw new Error("expected the database to refuse that statement");
}

type EventSpec = {
  businessId?: string;
  actorUserId?: string;
  action?: string;
  entityType?: string;
  entityId?: string | null;
  summary?: string;
  detail?: Record<string, unknown>;
  createdAt?: string;
};

function writeEvent(client: PoolClient, spec: EventSpec = {}) {
  return client.query<{ id: string }>(
    `insert into activity_log
       (business_id, actor_user_id, action, entity_type, entity_id, summary,
        detail, created_at)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb, coalesce($8::timestamptz, now()))
     returning id`,
    [
      spec.businessId ?? ids.business,
      spec.actorUserId ?? ids.owner,
      spec.action ?? "product.created",
      spec.entityType ?? "product",
      spec.entityId ?? null,
      spec.summary ?? "Added Tomatoes",
      JSON.stringify(spec.detail ?? {}),
      spec.createdAt ?? null,
    ],
  );
}

async function feed(
  client: PoolClient,
  options: {
    businessId?: string;
    filter?: string;
    before?: string;
    beforeId?: string;
    limit?: number;
  } = {},
) {
  const result = await client.query<{
    id: string;
    action: string;
    entity_id: string | null;
    summary: string;
    detail: Record<string, unknown>;
    created_at: Date;
    actor_email: string | null;
  }>(
    `select id, action, entity_id, summary, detail, created_at, actor_email
       from private.activity_feed($1, $2, $3::timestamptz, $4::uuid, $5)`,
    [
      options.businessId ?? ids.business,
      options.filter ?? "all",
      options.before ?? null,
      options.beforeId ?? null,
      options.limit ?? 50,
    ],
  );
  return result.rows;
}

beforeAll(async () => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into businesses (id, name, business_type)
       values ($1, 'Activity Cafe', 'cafe'), ($2, 'Activity Shop', 'retail')`,
      [ids.business, ids.otherBusiness],
    );
    await client.query(
      `insert into auth.users (id, email) values
         ($1, $2), ($3, $4), ($5, $6), ($7, $8)`,
      [
        ids.owner,
        ownerEmail,
        ids.staff,
        `activity-staff-${ids.business}@test.invalid`,
        ids.viewer,
        `activity-viewer-${ids.business}@test.invalid`,
        ids.otherOwner,
        `activity-owner-${ids.otherBusiness}@test.invalid`,
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
      `insert into suppliers (id, business_id, name)
       values ($1, $2, 'Activity Produce')`,
      [ids.supplier, ids.business],
    );
    await client.query(
      `insert into products (id, business_id, name, sku, unit_of_measure, cost_price)
       values ($1, $2, 'Tomatoes', 'ACT-1', 'kg', 4.20)`,
      [ids.product, ids.business],
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
    [ids.owner, ids.staff, ids.viewer, ids.otherOwner],
  ]);
  await pool.end();
});

describe("activity log boundaries", () => {
  it("keeps the event only when the change it describes commits", async () => {
    await expect(
      asUser(ids.owner, async (client) => {
        await client.query(
          `update products set name = 'Tomatoes, truss' where id = $1`,
          [ids.product],
        );
        await writeEvent(client, { summary: "Renamed Tomatoes" });
        throw new Error("the action failed after writing");
      }),
    ).rejects.toThrow("the action failed after writing");

    const stored = await asUser(ids.owner, async (client) => {
      const product = await client.query<{ name: string }>(
        "select name from products where id = $1",
        [ids.product],
      );
      const events = await client.query<{ n: number }>(
        "select count(*)::int as n from activity_log where business_id = $1",
        [ids.business],
      );
      return {
        name: product.rows[0]?.name,
        events: events.rows[0]?.n,
      };
    });

    expect(stored.name).toBe("Tomatoes");
    expect(stored.events).toBe(0);
  });

  it("refuses a viewer's event but accepts a member's", async () => {
    const refused = await asUser(ids.viewer, (client) =>
      captureError(client, () =>
        writeEvent(client, { actorUserId: ids.viewer }),
      ),
    );
    expect(refused.code).toBe("42501");

    const written = await asUser(ids.staff, (client) =>
      writeEvent(client, {
        actorUserId: ids.staff,
        summary: "Added Tomatoes",
      }),
    );
    expect(written.rows[0]?.id).toBeTruthy();
  });

  it("is append-only for the application role", async () => {
    // One statement per transaction: a refused update would leave the transaction
    // aborted, so a delete attempted after it would fail for the wrong reason.
    const update = await asUser(ids.owner, async (client) => {
      const event = await writeEvent(client, { summary: "Added Tomatoes" });
      return captureError(client, () =>
        client.query("update activity_log set summary = 'x' where id = $1", [
          event.rows[0].id,
        ]),
      );
    });
    const remove = await asUser(ids.owner, async (client) => {
      const event = await writeEvent(client, { summary: "Added Tomatoes" });
      return captureError(client, () =>
        client.query("delete from activity_log where id = $1", [
          event.rows[0].id,
        ]),
      );
    });

    expect(update.code).toBe("42501");
    expect(remove.code).toBe("42501");
  });

  it("hides another business's events and refuses its feed", async () => {
    await asUserCommitted(ids.otherOwner, (client) =>
      writeEvent(client, {
        businessId: ids.otherBusiness,
        actorUserId: ids.otherOwner,
        summary: "Added their own product",
      }),
    );

    const result = await asUser(ids.owner, async (client) => {
      const rows = await feed(client);
      const foreign = await captureError(client, () =>
        feed(client, { businessId: ids.otherBusiness }),
      );
      return { rows, foreign };
    });

    expect(
      result.rows.every((row) => row.summary !== "Added their own product"),
    ).toBe(true);
    expect(result.foreign.code).toBe("P0002");
  });
});

describe("activity feed", () => {
  it("returns the actor's email and filters by area", async () => {
    const rows = await asUser(ids.owner, async (client) => {
      await writeEvent(client, { summary: "Added Tomatoes" });
      await writeEvent(client, {
        action: "receipt.recorded",
        entityType: "receipt",
        summary: "Received a delivery on PO-0001",
      });
      return {
        products: await feed(client, { filter: "products" }),
        stock: await feed(client, { filter: "stock" }),
        everything: await feed(client),
      };
    });

    expect(rows.products).toHaveLength(1);
    expect(rows.products[0]?.action).toBe("product.created");
    expect(rows.products[0]?.actor_email).toBe(ownerEmail);
    expect(rows.stock).toHaveLength(1);
    expect(rows.stock[0]?.action).toBe("receipt.recorded");
    expect(rows.everything).toHaveLength(2);
  });

  it("pages on created_at and id so a tie cannot hide an event", async () => {
    const pages = await asUser(ids.owner, async (client) => {
      const ids: string[] = [];
      for (const minute of [1, 2, 3]) {
        const event = await writeEvent(client, {
          summary: `Paged event ${minute}`,
          createdAt: `2026-11-25T09:0${minute}:00Z`,
        });
        ids.push(event.rows[0].id);
      }
      const first = await feed(client, { limit: 2 });
      const last = first[first.length - 1];
      // The cursor is the last row's own pair, exactly as the lib builds it.
      const second = await feed(client, {
        limit: 2,
        before: last?.created_at.toISOString(),
        beforeId: last?.id,
      });
      return { ids, first, second };
    });

    expect(pages.first.map((row) => row.summary)).toEqual([
      "Paged event 3",
      "Paged event 2",
    ]);
    expect(pages.second.map((row) => row.summary)).toEqual(["Paged event 1"]);
  });

  it("points a receipt event at the receipt it recorded", async () => {
    const result = await asUser(ids.owner, async (client) => {
      const order = await client.query<{ id: string }>(
        `insert into purchase_orders (business_id, supplier_id, order_number)
         values ($1, $2, 'PO-ACT-1') returning id`,
        [ids.business, ids.supplier],
      );
      const orderId = order.rows[0].id;
      const line = await client.query<{ id: string }>(
        `insert into purchase_order_lines
           (business_id, purchase_order_id, product_id, quantity_ordered, unit_cost)
         values ($1, $2, $3, 10, 4.20) returning id`,
        [ids.business, orderId, ids.product],
      );
      await client.query(
        "select private.set_purchase_order_status($1, 'ordered')",
        [orderId],
      );
      const receipt = await client.query<{ receipt_id: string }>(
        `select receipt_id
           from private.receive_purchase_order($1, $2::jsonb, $3::uuid)`,
        [
          orderId,
          JSON.stringify([
            {
              purchase_order_line_id: line.rows[0].id,
              received: "10",
              accepted: "10",
              damaged: "0",
              rejected: "0",
            },
          ]),
          randomUUID(),
        ],
      );
      const receiptId = receipt.rows[0].receipt_id;

      await writeEvent(client, {
        action: "receipt.recorded",
        entityType: "receipt",
        entityId: receiptId,
        summary: "Received a delivery on PO-ACT-1",
        detail: { order_id: orderId },
      });

      const rows = await feed(client, { filter: "stock" });
      const stored = await client.query<{ n: number }>(
        `select count(*)::int as n from purchase_receipts
          where business_id = $1 and id = $2`,
        [ids.business, receiptId],
      );
      return {
        event: rows.find((row) => row.entity_id === receiptId),
        receiptExists: (stored.rows[0]?.n ?? 0) === 1,
      };
    });

    expect(result.receiptExists).toBe(true);
    expect(typeof result.event?.detail.order_id).toBe("string");
    expect(result.event?.summary).toBe("Received a delivery on PO-ACT-1");
  });
});
