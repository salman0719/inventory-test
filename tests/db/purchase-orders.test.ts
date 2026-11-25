import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { databaseUrl } from "../../db/env";

/**
 * Transactional receiving, against real Postgres as `authenticated`.
 *
 * These tests do not mock the function: they exercise the locks, the idempotency
 * key, the over-receipt refusal and the tenant checks exactly as the server action
 * does. Most blocks roll back; the two concurrency tests must commit, because a
 * second session can only see the first one's work after it commits.
 */
const pool = new Pool({ connectionString: databaseUrl(), max: 6 });

const ids = {
  business: randomUUID(),
  otherBusiness: randomUUID(),
  owner: randomUUID(),
  staff: randomUUID(),
  viewer: randomUUID(),
  stranger: randomUUID(),
  otherOwner: randomUUID(),
  supplier: randomUUID(),
  secondSupplier: randomUUID(),
  otherSupplier: randomUUID(),
  product: randomUUID(),
  secondProduct: randomUUID(),
  otherProduct: randomUUID(),
};

let sequence = 0;

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

/** For the concurrency tests: commit so the other session can see the rows. */
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

type LineSpec = { productId: string; quantity: string; unitCost: string };

async function createOrder(
  client: PoolClient,
  options: {
    supplierId?: string;
    lines?: LineSpec[];
    status?: "draft" | "ordered";
    businessId?: string;
  } = {},
): Promise<{ orderId: string; lineIds: string[] }> {
  sequence += 1;
  const businessId = options.businessId ?? ids.business;
  const lines = options.lines ?? [
    { productId: ids.product, quantity: "10", unitCost: "4.20" },
    { productId: ids.secondProduct, quantity: "2", unitCost: "9.00" },
  ];

  const order = await client.query<{ id: string }>(
    `insert into purchase_orders (business_id, supplier_id, order_number)
     values ($1, $2, $3)
     returning id`,
    [
      businessId,
      options.supplierId ?? ids.supplier,
      `PO-T-${String(sequence).padStart(4, "0")}`,
    ],
  );
  const orderId = order.rows[0].id;

  const lineIds: string[] = [];
  for (const line of lines) {
    const inserted = await client.query<{ id: string }>(
      `insert into purchase_order_lines
         (business_id, purchase_order_id, product_id, quantity_ordered, unit_cost)
       values ($1, $2, $3, $4::numeric, $5::numeric)
       returning id`,
      [businessId, orderId, line.productId, line.quantity, line.unitCost],
    );
    lineIds.push(inserted.rows[0].id);
  }

  if (options.status !== "draft") {
    await client.query(
      "select private.set_purchase_order_status($1, 'ordered')",
      [orderId],
    );
  }

  return { orderId, lineIds };
}

/**
 * One line of a delivery. `quantity` is what arrived; the breakdown defaults to
 * "all accepted", which is how most deliveries arrive and keeps the older cases
 * readable.
 */
type ReceiptSpec = {
  lineId: string;
  quantity: string;
  accepted?: string;
  damaged?: string;
  rejected?: string;
  reason?: string;
};

function receive(
  client: PoolClient,
  orderId: string,
  lines: ReceiptSpec[],
  key: string = randomUUID(),
) {
  return client.query<{ receipt_id: string; status: string }>(
    `select receipt_id, status
       from private.receive_purchase_order($1, $2::jsonb, $3::uuid)`,
    [
      orderId,
      JSON.stringify(
        lines.map((line) => {
          const damaged = line.damaged ?? "0";
          const rejected = line.rejected ?? "0";
          const accepted =
            line.accepted ??
            String(Number(line.quantity) - Number(damaged) - Number(rejected));
          return {
            purchase_order_line_id: line.lineId,
            received: line.quantity,
            accepted,
            damaged,
            rejected,
            reason: line.reason,
          };
        }),
      ),
      key,
    ],
  );
}

/**
 * Run a statement we expect to fail, and keep the transaction usable: Postgres
 * aborts a transaction after any error, so a savepoint is required before a test
 * can read the rows the failed statement should not have written.
 */
async function captureError(
  client: PoolClient,
  run: () => Promise<unknown>,
): Promise<{ code: string; message: string }> {
  await client.query("savepoint attempt");
  try {
    await run();
    await client.query("release savepoint attempt");
    return { code: "", message: "" };
  } catch (error) {
    await client.query("rollback to savepoint attempt");
    return {
      code: (error as { code?: string }).code ?? "",
      message: (error as { message?: string }).message ?? "",
    };
  }
}

async function orderState(client: PoolClient, orderId: string) {
  const order = await client.query<{ status: string; ordered_at: Date | null }>(
    "select status, ordered_at from purchase_orders where id = $1",
    [orderId],
  );
  const receipts = await client.query<{ n: number }>(
    "select count(*)::int as n from purchase_receipts where purchase_order_id = $1",
    [orderId],
  );
  const movements = await client.query<{ n: number; total: string }>(
    `select count(*)::int as n, coalesce(sum(quantity_delta), 0)::text as total
       from stock_movements
      where reference_type = 'purchase_receipt'
        and reference_id in (
          select id from purchase_receipts where purchase_order_id = $1
        )`,
    [orderId],
  );
  return {
    status: order.rows[0]?.status,
    orderedAt: order.rows[0]?.ordered_at,
    receipts: receipts.rows[0]?.n ?? 0,
    movements: movements.rows[0]?.n ?? 0,
    receivedStock: Number(movements.rows[0]?.total ?? 0),
  };
}

beforeAll(async () => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into businesses (id, name, business_type)
       values ($1, 'Order Cafe', 'cafe'), ($2, 'Order Shop', 'retail')`,
      [ids.business, ids.otherBusiness],
    );
    await client.query(
      `insert into auth.users (id, email) values
         ($1, $2), ($3, $4), ($5, $6), ($7, $8), ($9, $10)`,
      [
        ids.owner,
        `orders-owner-${ids.business}@test.invalid`,
        ids.staff,
        `orders-staff-${ids.business}@test.invalid`,
        ids.viewer,
        `orders-viewer-${ids.business}@test.invalid`,
        ids.stranger,
        `orders-stranger-${ids.stranger}@test.invalid`,
        ids.otherOwner,
        `orders-owner-${ids.otherBusiness}@test.invalid`,
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
      `insert into suppliers (id, business_id, name) values
         ($1, $2, 'Order Produce'), ($3, $2, 'Order Dairy'), ($4, $5, 'Other Produce')`,
      [
        ids.supplier,
        ids.business,
        ids.secondSupplier,
        ids.otherSupplier,
        ids.otherBusiness,
      ],
    );
    await client.query(
      `insert into products (id, business_id, name, sku, unit_of_measure, cost_price)
       values ($1, $2, 'Tomatoes', 'ORD-1', 'kg', 4.20),
              ($3, $2, 'Milk', 'ORD-2', 'bottle', 3.10),
              ($4, $5, 'Other beans', 'ORD-3', 'kg', 20.00)`,
      [
        ids.product,
        ids.business,
        ids.secondProduct,
        ids.otherProduct,
        ids.otherBusiness,
      ],
    );
    await client.query("commit");
  } finally {
    client.release();
  }
});

afterAll(async () => {
  // Receipts have no cascade from purchase_orders, so clear them first.
  await pool.query(
    "delete from purchase_receipts where business_id = any($1::uuid[])",
    [[ids.business, ids.otherBusiness]],
  );
  await pool.query("delete from businesses where id = any($1::uuid[])", [
    [ids.business, ids.otherBusiness],
  ]);
  await pool.query("delete from auth.users where id = any($1::uuid[])", [
    [ids.owner, ids.staff, ids.viewer, ids.stranger, ids.otherOwner],
  ]);
  await pool.end();
});

describe("receive_purchase_order", () => {
  it("receives part of an order and leaves it partly received", async () => {
    const result = await asUser(ids.owner, async (client) => {
      const { orderId, lineIds } = await createOrder(client);
      const receipt = await receive(client, orderId, [
        { lineId: lineIds[0], quantity: "4" },
      ]);
      const line = await client.query<{ received_quantity: string }>(
        "select received_quantity::text from purchase_order_lines where id = $1",
        [lineIds[0]],
      );
      return {
        status: receipt.rows[0]?.status,
        received: line.rows[0]?.received_quantity,
        state: await orderState(client, orderId),
      };
    });

    expect(result.status).toBe("partially_received");
    expect(Number(result.received)).toBe(4);
    expect(result.state.receipts).toBe(1);
    expect(result.state.movements).toBe(1);
    expect(result.state.receivedStock).toBe(4);
  });

  it("completes an order over two deliveries and records each line once", async () => {
    const result = await asUser(ids.owner, async (client) => {
      const { orderId, lineIds } = await createOrder(client);

      const first = await receive(client, orderId, [
        { lineId: lineIds[0], quantity: "4" },
        { lineId: lineIds[1], quantity: "1" },
      ]);
      const second = await receive(client, orderId, [
        { lineId: lineIds[0], quantity: "6" },
        { lineId: lineIds[1], quantity: "1" },
      ]);
      const lines = await client.query<{ received_quantity: string }>(
        `select received_quantity::text from purchase_order_lines
          where purchase_order_id = $1`,
        [orderId],
      );

      return {
        first: first.rows[0]?.status,
        second: second.rows[0]?.status,
        received: lines.rows
          .map((row) => Number(row.received_quantity))
          .sort((a, b) => a - b),
        state: await orderState(client, orderId),
      };
    });

    expect(result.first).toBe("partially_received");
    expect(result.second).toBe("received");
    expect(result.received).toEqual([2, 10]);
    expect(result.state.status).toBe("received");
    expect(result.state.receipts).toBe(2);
    expect(result.state.movements).toBe(4);
    expect(result.state.receivedStock).toBe(12);
  });

  it("refuses more than is outstanding, writes nothing and names the product", async () => {
    const result = await asUser(ids.owner, async (client) => {
      const { orderId, lineIds } = await createOrder(client);
      const error = await captureError(client, () =>
        receive(client, orderId, [{ lineId: lineIds[0], quantity: "11" }]),
      );
      return { error, state: await orderState(client, orderId) };
    });

    expect(result.error.code).toBe("23514");
    expect(result.error.message).toContain("Only 10 kg of Tomatoes");
    expect(result.state.receipts).toBe(0);
    expect(result.state.movements).toBe(0);
    expect(result.state.status).toBe("ordered");
  });

  it("replays the same idempotency key instead of posting stock twice", async () => {
    const result = await asUser(ids.owner, async (client) => {
      const { orderId, lineIds } = await createOrder(client);
      const key = randomUUID();
      const lines = [
        { lineId: lineIds[0], quantity: "10" },
        { lineId: lineIds[1], quantity: "2" },
      ];

      const first = await receive(client, orderId, lines, key);
      const replay = await receive(client, orderId, lines, key);

      return {
        firstId: first.rows[0]?.receipt_id,
        replayId: replay.rows[0]?.receipt_id,
        replayStatus: replay.rows[0]?.status,
        state: await orderState(client, orderId),
      };
    });

    expect(result.replayId).toBe(result.firstId);
    expect(result.replayStatus).toBe("received");
    expect(result.state.receipts).toBe(1);
    expect(result.state.movements).toBe(2);
    expect(result.state.receivedStock).toBe(12);
  });

  it("rejects a key already used on another order", async () => {
    await expect(
      asUser(ids.owner, async (client) => {
        const key = randomUUID();
        const first = await createOrder(client);
        const second = await createOrder(client, {
          supplierId: ids.secondSupplier,
        });
        await receive(
          client,
          first.orderId,
          [{ lineId: first.lineIds[0], quantity: "1" }],
          key,
        );
        await receive(
          client,
          second.orderId,
          [{ lineId: second.lineIds[0], quantity: "1" }],
          key,
        );
      }),
    ).rejects.toMatchObject({ code: "22023" });
  });

  it("rejects the same order line twice in one receipt", async () => {
    const result = await asUser(ids.owner, async (client) => {
      const { orderId, lineIds } = await createOrder(client);
      const error = await captureError(client, () =>
        receive(client, orderId, [
          { lineId: lineIds[0], quantity: "5" },
          { lineId: lineIds[0], quantity: "5" },
        ]),
      );
      return { error, state: await orderState(client, orderId) };
    });

    expect(result.error.code).toBe("22023");
    expect(result.state.receipts).toBe(0);
    expect(result.state.receivedStock).toBe(0);
  });

  it("rejects a line that belongs to another order", async () => {
    const result = await asUser(ids.owner, async (client) => {
      const first = await createOrder(client);
      const second = await createOrder(client, {
        supplierId: ids.secondSupplier,
      });
      const error = await captureError(client, () =>
        receive(client, first.orderId, [
          { lineId: second.lineIds[0], quantity: "1" },
        ]),
      );
      return { error, state: await orderState(client, first.orderId) };
    });

    expect(result.error.code).toBe("22023");
    expect(result.state.receipts).toBe(0);
  });

  it("refuses a zero quantity and a draft order", async () => {
    await expect(
      asUser(ids.owner, async (client) => {
        const { orderId, lineIds } = await createOrder(client);
        await receive(client, orderId, [{ lineId: lineIds[0], quantity: "0" }]);
      }),
    ).rejects.toMatchObject({ code: "22023" });

    await expect(
      asUser(ids.owner, async (client) => {
        const { orderId, lineIds } = await createOrder(client, {
          status: "draft",
        });
        await receive(client, orderId, [{ lineId: lineIds[0], quantity: "1" }]);
      }),
    ).rejects.toMatchObject({ code: "22023" });
  });

  it("lets staff receive and refuses a viewer", async () => {
    const status = await asUser(ids.staff, async (client) => {
      const { orderId, lineIds } = await createOrder(client);
      const receipt = await receive(client, orderId, [
        { lineId: lineIds[0], quantity: "1" },
      ]);
      return receipt.rows[0]?.status;
    });
    expect(status).toBe("partially_received");

    await expect(
      asUser(ids.viewer, async (client) => {
        const { orderId, lineIds } = await createOrder(client);
        await receive(client, orderId, [{ lineId: lineIds[0], quantity: "1" }]);
      }),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("does not reveal whether another business's order exists", async () => {
    // RLS stops the cafe owner creating the retail order, which is why the other
    // owner creates it — and commits, so a second session can see it.
    const foreignOrderId = await asUserCommitted(
      ids.otherOwner,
      async (client) => {
        const created = await client.query<{ id: string }>(
          `insert into purchase_orders (business_id, supplier_id, order_number)
         values ($1, $2, $3) returning id`,
          [
            ids.otherBusiness,
            ids.otherSupplier,
            `PO-OTHER-${randomUUID().slice(0, 8)}`,
          ],
        );
        return created.rows[0].id;
      },
    );

    const messages = await asUser(ids.owner, async (client) => {
      const attempt = async (orderId: string) =>
        (
          await captureError(client, () =>
            receive(client, orderId, [{ lineId: randomUUID(), quantity: "1" }]),
          )
        ).message;
      return {
        missing: await attempt(randomUUID()),
        foreign: await attempt(foreignOrderId),
      };
    });

    expect(messages.missing).toBe("That order is not in this business.");
    expect(messages.foreign).toBe(messages.missing);
  });

  it("cannot be replaced by a direct write to received_quantity", async () => {
    const draft = await asUser(ids.owner, async (client) => {
      const { orderId, lineIds } = await createOrder(client, {
        status: "draft",
      });
      const updateError = await captureError(client, () =>
        client.query(
          "update purchase_order_lines set received_quantity = 1 where id = $1",
          [lineIds[0]],
        ),
      );
      const insertError = await captureError(client, () =>
        client.query(
          `insert into purchase_order_lines
             (business_id, purchase_order_id, product_id, quantity_ordered,
              received_quantity, unit_cost)
           values ($1, $2, $3, 1, 1, 1)`,
          [ids.business, orderId, ids.product],
        ),
      );
      return { updateError: updateError.code, insertError: insertError.code };
    });

    expect(draft.updateError).toBe("42501");
    expect(draft.insertError).toBe("42501");
  });

  it("closes lines and notes once an order has been sent", async () => {
    const result = await asUser(ids.owner, async (client) => {
      const { orderId, lineIds } = await createOrder(client);
      const insert = await captureError(client, () =>
        client.query(
          `insert into purchase_order_lines
             (business_id, purchase_order_id, product_id, quantity_ordered, unit_cost)
           values ($1, $2, $3, 1, 1)`,
          [ids.business, orderId, ids.product],
        ),
      );
      const deleted = await client.query(
        "delete from purchase_order_lines where id = $1",
        [lineIds[0]],
      );
      const renamed = await client.query(
        "update purchase_orders set notes = 'changed' where id = $1",
        [orderId],
      );
      return { insert, deleted: deleted.rowCount, renamed: renamed.rowCount };
    });

    expect(result.insert.code).toBe("42501");
    expect(result.deleted).toBe(0);
    expect(result.renamed).toBe(0);
  });

  it("still lets a draft's lines be edited and removed", async () => {
    const result = await asUser(ids.owner, async (client) => {
      const { orderId, lineIds } = await createOrder(client, {
        status: "draft",
      });
      const updated = await client.query(
        "update purchase_order_lines set quantity_ordered = 12 where id = $1",
        [lineIds[0]],
      );
      const deleted = await client.query(
        "delete from purchase_order_lines where id = $1",
        [lineIds[1]],
      );
      const added = await client.query(
        `insert into purchase_order_lines
           (business_id, purchase_order_id, product_id, quantity_ordered, unit_cost)
         values ($1, $2, $3, 2, 3.10)`,
        [ids.business, orderId, ids.secondProduct],
      );
      return {
        updated: updated.rowCount,
        deleted: deleted.rowCount,
        added: added.rowCount,
      };
    });

    expect(result).toEqual({ updated: 1, deleted: 1, added: 1 });
  });
});

describe("set_purchase_order_status", () => {
  it("marks a draft ordered and records when", async () => {
    const result = await asUser(ids.owner, async (client) => {
      const { orderId, lineIds } = await createOrder(client, {
        status: "draft",
      });
      await client.query(
        "select private.set_purchase_order_status($1, 'ordered')",
        [orderId],
      );
      const state = await orderState(client, orderId);
      // A second attempt is not a valid transition.
      const repeat = await client
        .query("select private.set_purchase_order_status($1, 'ordered')", [
          orderId,
        ])
        .then(
          () => "",
          (failure: { code?: string }) => failure.code ?? "",
        );
      return { state, repeat, lineId: lineIds[0] };
    });

    expect(result.state.status).toBe("ordered");
    expect(result.state.orderedAt).not.toBeNull();
    expect(result.repeat).toBe("22023");
  });

  it("cancels an ordered or partly received order but not a received one", async () => {
    await expect(
      asUser(ids.owner, async (client) => {
        const { orderId } = await createOrder(client);
        await client.query(
          "select private.set_purchase_order_status($1, 'cancelled')",
          [orderId],
        );
      }),
    ).resolves.toBeUndefined();

    await expect(
      asUser(ids.owner, async (client) => {
        const { orderId, lineIds } = await createOrder(client);
        await receive(client, orderId, [
          { lineId: lineIds[0], quantity: "10" },
          { lineId: lineIds[1], quantity: "2" },
        ]);
        await client.query(
          "select private.set_purchase_order_status($1, 'cancelled')",
          [orderId],
        );
      }),
    ).rejects.toMatchObject({ code: "22023" });
  });

  it("allows one open order per supplier and frees the slot on cancel", async () => {
    await expect(
      asUser(ids.owner, async (client) => {
        const first = await createOrder(client);
        sequence += 1;
        await client.query(
          `insert into purchase_orders (business_id, supplier_id, order_number)
           values ($1, $2, $3)`,
          [ids.business, ids.supplier, `PO-T-${sequence}-DUP`],
        );
        return first;
      }),
    ).rejects.toMatchObject({ code: "23505" });

    const open = await asUser(ids.owner, async (client) => {
      const first = await createOrder(client);
      await client.query(
        "select private.set_purchase_order_status($1, 'cancelled')",
        [first.orderId],
      );
      const second = await createOrder(client);
      return { first: first.orderId, second: second.orderId };
    });

    expect(open.second).not.toBe(open.first);
  });
});

describe("concurrent receiving", () => {
  it("queues two receivers so the same delivery cannot arrive twice", async () => {
    const { orderId, lineIds } = await asUserCommitted(ids.owner, (client) =>
      createOrder(client, {
        lines: [{ productId: ids.product, quantity: "5", unitCost: "4.20" }],
      }),
    );

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

      const taken = await receive(first, orderId, [
        { lineId: lineIds[0], quantity: "5" },
      ]);
      expect(taken.rows[0]?.status).toBe("received");

      const blocked = receive(second, orderId, [
        { lineId: lineIds[0], quantity: "5" },
      ]).then(
        () => ({ ok: true as const, code: "" }),
        (failure: { code?: string }) => ({
          ok: false as const,
          code: failure.code ?? "",
        }),
      );

      // The second call waits on the order row lock the first holds.
      await new Promise((resolve) => setTimeout(resolve, 150));
      await first.query("commit");

      const outcome = await blocked;
      await second.query("rollback");

      expect(outcome.ok).toBe(false);
      expect(["22023", "23514"]).toContain(outcome.code);
    } finally {
      first.release();
      second.release();
    }

    const stored = await asUser(ids.owner, (client) =>
      orderState(client, orderId),
    );
    expect(stored.receipts).toBe(1);
    expect(stored.movements).toBe(1);
    expect(stored.receivedStock).toBe(5);
  });

  it("collapses two identical submissions into one receipt", async () => {
    const { orderId, lineIds } = await asUserCommitted(ids.owner, (client) =>
      createOrder(client, {
        lines: [{ productId: ids.product, quantity: "5", unitCost: "4.20" }],
        supplierId: ids.secondSupplier,
      }),
    );
    const key = randomUUID();

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

      const taken = await receive(
        first,
        orderId,
        [{ lineId: lineIds[0], quantity: "5" }],
        key,
      );

      const blocked = receive(
        second,
        orderId,
        [{ lineId: lineIds[0], quantity: "5" }],
        key,
      );

      await new Promise((resolve) => setTimeout(resolve, 150));
      await first.query("commit");
      const replay = await blocked;
      await second.query("commit");

      expect(replay.rows[0]?.receipt_id).toBe(taken.rows[0]?.receipt_id);
    } finally {
      first.release();
      second.release();
    }

    const stored = await asUser(ids.owner, (client) =>
      orderState(client, orderId),
    );
    expect(stored.receipts).toBe(1);
    expect(stored.receivedStock).toBe(5);
  });
});

describe("receiving with discrepancies", () => {
  it("splits arrived stock into accepted, damaged and rejected", async () => {
    const result = await asUser(ids.owner, async (client) => {
      const { orderId, lineIds } = await createOrder(client);
      const receipt = await receive(client, orderId, [
        {
          lineId: lineIds[0],
          quantity: "8",
          accepted: "7",
          damaged: "1",
          rejected: "0",
          reason: "One tub crushed in transit",
        },
      ]);
      const line = await client.query<{
        quantity_received: string;
        quantity_accepted: string;
        quantity_damaged: string;
        quantity_rejected: string;
        discrepancy_reason: string | null;
      }>(
        `select quantity_received::text, quantity_accepted::text,
                quantity_damaged::text, quantity_rejected::text,
                discrepancy_reason
           from purchase_receipt_lines
          where receipt_id = $1`,
        [receipt.rows[0]?.receipt_id],
      );
      const ordered = await client.query<{ received_quantity: string }>(
        "select received_quantity::text from purchase_order_lines where id = $1",
        [lineIds[0]],
      );
      return {
        status: receipt.rows[0]?.status,
        parts: line.rows[0],
        arrived: Number(ordered.rows[0]?.received_quantity),
        state: await orderState(client, orderId),
      };
    });

    expect(result.parts).toEqual({
      quantity_received: "8.000",
      quantity_accepted: "7.000",
      quantity_damaged: "1.000",
      quantity_rejected: "0.000",
      discrepancy_reason: "One tub crushed in transit",
    });
    // Only what was accepted reaches the ledger; the line counts what arrived.
    expect(result.state.receivedStock).toBe(7);
    expect(result.arrived).toBe(8);
    expect(result.status).toBe("partially_received");
  });

  it("writes no stock movement when nothing was usable", async () => {
    const result = await asUser(ids.owner, async (client) => {
      const { orderId, lineIds } = await createOrder(client);
      await receive(client, orderId, [
        {
          lineId: lineIds[0],
          quantity: "5",
          accepted: "0",
          damaged: "5",
          reason: "Whole crate frozen on arrival",
        },
      ]);
      const ordered = await client.query<{ received_quantity: string }>(
        "select received_quantity::text from purchase_order_lines where id = $1",
        [lineIds[0]],
      );
      return {
        arrived: Number(ordered.rows[0]?.received_quantity),
        state: await orderState(client, orderId),
      };
    });

    expect(result.state.movements).toBe(0);
    expect(result.state.receivedStock).toBe(0);
    expect(result.arrived).toBe(5);
  });

  it("refuses a breakdown that does not add up and writes nothing", async () => {
    const result = await asUser(ids.owner, async (client) => {
      const { orderId, lineIds } = await createOrder(client);
      const error = await captureError(client, () =>
        receive(client, orderId, [
          {
            lineId: lineIds[0],
            quantity: "8",
            accepted: "7",
            damaged: "0",
            rejected: "0",
          },
        ]),
      );
      return { error, state: await orderState(client, orderId) };
    });

    expect(result.error.code).toBe("22023");
    expect(result.error.message).toContain("must add up");
    expect(result.state.receipts).toBe(0);
    expect(result.state.movements).toBe(0);
  });

  it("asks for a note when stock arrived damaged or was rejected", async () => {
    const result = await asUser(ids.owner, async (client) => {
      const { orderId, lineIds } = await createOrder(client);
      const error = await captureError(client, () =>
        receive(client, orderId, [
          {
            lineId: lineIds[0],
            quantity: "5",
            accepted: "4",
            rejected: "1",
          },
        ]),
      );
      return { error, state: await orderState(client, orderId) };
    });

    expect(result.error.code).toBe("22023");
    expect(result.error.message).toContain("what was wrong");
    expect(result.state.receipts).toBe(0);
  });
});

describe("close_purchase_order_short", () => {
  it("closes the balance, records why, and frees the supplier", async () => {
    const result = await asUser(ids.owner, async (client) => {
      const { orderId, lineIds } = await createOrder(client);
      await receive(client, orderId, [{ lineId: lineIds[0], quantity: "4" }]);
      await client.query("select private.close_purchase_order_short($1, $2)", [
        orderId,
        "The rest of the order was not available",
      ]);
      const order = await client.query<{
        status: string;
        closed_short_at: Date | null;
        close_reason: string | null;
      }>(
        `select status, closed_short_at, close_reason
           from purchase_orders where id = $1`,
        [orderId],
      );
      const line = await client.query<{ received_quantity: string }>(
        "select received_quantity::text from purchase_order_lines where id = $1",
        [lineIds[0]],
      );
      // The one-open-order-per-supplier index ignores a closed order, so the
      // supplier can be ordered from again without losing this order's history.
      const next = await createOrder(client);
      return {
        order: order.rows[0],
        received: Number(line.rows[0]?.received_quantity),
        nextOrder: next.orderId,
      };
    });

    expect(result.order?.status).toBe("received");
    expect(result.order?.close_reason).toBe(
      "The rest of the order was not available",
    );
    expect(result.order?.closed_short_at).toBeInstanceOf(Date);
    // Balances are left exactly as they were; nothing was received in their place.
    expect(result.received).toBe(4);
    expect(result.nextOrder).toBeTruthy();
  });

  it("refuses an order that was never partly received", async () => {
    const result = await asUser(ids.owner, async (client) => {
      const { orderId } = await createOrder(client);
      return captureError(client, () =>
        client.query("select private.close_purchase_order_short($1, $2)", [
          orderId,
          "Not coming",
        ]),
      );
    });

    expect(result.code).toBe("22023");
    expect(result.message).toContain("partly received");
  });

  it("refuses a blank reason", async () => {
    const result = await asUser(ids.owner, async (client) => {
      const { orderId, lineIds } = await createOrder(client);
      await receive(client, orderId, [{ lineId: lineIds[0], quantity: "1" }]);
      return captureError(client, () =>
        client.query("select private.close_purchase_order_short($1, $2)", [
          orderId,
          "   ",
        ]),
      );
    });

    expect(result.code).toBe("22023");
    expect(result.message).toContain("why the order is closing short");
  });
});
