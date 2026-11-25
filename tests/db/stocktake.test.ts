import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { databaseUrl } from "../../db/env";

/**
 * Stocktake against real Postgres as `authenticated`.
 *
 * The interesting parts are the ones a UI cannot guarantee: lines snapshot on-hand
 * when the sheet opens, the final adjustment comes from the *live* ledger rather than
 * that snapshot, a second completion writes nothing, and the write functions are the
 * only path for the application role.
 */
const pool = new Pool({ connectionString: databaseUrl(), max: 4 });

const suffix = randomUUID().slice(0, 8);

const ids = {
  business: randomUUID(),
  otherBusiness: randomUUID(),
  resetBusiness: randomUUID(),
  owner: randomUUID(),
  staff: randomUUID(),
  viewer: randomUUID(),
  otherOwner: randomUUID(),
  resetOwner: randomUUID(),
  category: randomUUID(),
  otherCategory: randomUUID(),
  productCoffee: randomUUID(),
  productOat: randomUUID(),
  productArchived: randomUUID(),
  otherProduct: randomUUID(),
};

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

async function expectRefusal(
  userId: string,
  run: (client: PoolClient) => Promise<unknown>,
): Promise<{ code?: string; message: string }> {
  try {
    await asUserCommitted(userId, run);
  } catch (error) {
    const failure = error as { code?: string; message?: string };
    return { code: failure.code, message: failure.message ?? "" };
  }
  throw new Error("expected the database to refuse that statement");
}

type SessionRow = {
  session_id: string;
  reference: string;
  line_count: number;
};

async function createSession(
  userId: string,
  businessId: string,
  scope: Record<string, string> = {},
): Promise<SessionRow> {
  return asUserCommitted(userId, async (client) => {
    const result = await client.query<SessionRow>(
      `select session_id, reference, line_count
         from private.create_stocktake($1, $2::jsonb)`,
      [businessId, JSON.stringify(scope)],
    );
    const row = result.rows[0];
    if (!row) throw new Error("no session returned");
    return row;
  });
}

async function sheetLines(sessionId: string): Promise<
  {
    id: string;
    product_id: string;
    expected_quantity: string;
    counted_quantity: string | null;
    on_hand_before: string | null;
    applied_delta: string | null;
  }[]
> {
  const result = await pool.query(
    `select id, product_id, expected_quantity::text, counted_quantity::text,
            on_hand_before::text, applied_delta::text
       from stocktake_lines
      where session_id = $1
      order by product_id`,
    [sessionId],
  );
  return result.rows;
}

async function onHand(productId: string): Promise<number> {
  const result = await pool.query<{ total: string }>(
    `select coalesce(sum(quantity_delta), 0)::text as total
       from stock_movements where product_id = $1`,
    [productId],
  );
  return Number(result.rows[0]?.total ?? 0);
}

beforeAll(async () => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into businesses (id, name, business_type) values
         ($1, 'Stocktake Cafe', 'cafe'),
         ($2, 'Stocktake Shop', 'retail'),
         ($3, 'Stocktake Reset', 'cafe')`,
      [ids.business, ids.otherBusiness, ids.resetBusiness],
    );
    await client.query(
      `insert into auth.users (id, email) values
         ($1, $2), ($3, $4), ($5, $6), ($7, $8), ($9, $10)`,
      [
        ids.owner,
        `stocktake-owner-${suffix}@test.invalid`,
        ids.staff,
        `stocktake-staff-${suffix}@test.invalid`,
        ids.viewer,
        `stocktake-viewer-${suffix}@test.invalid`,
        ids.otherOwner,
        `stocktake-other-${suffix}@test.invalid`,
        ids.resetOwner,
        `stocktake-reset-${suffix}@test.invalid`,
      ],
    );
    await client.query(
      `insert into business_members (business_id, user_id, role) values
         ($1, $2, 'owner'), ($1, $3, 'staff'), ($1, $4, 'viewer'),
         ($5, $6, 'owner'), ($7, $8, 'owner')`,
      [
        ids.business,
        ids.owner,
        ids.staff,
        ids.viewer,
        ids.otherBusiness,
        ids.otherOwner,
        ids.resetBusiness,
        ids.resetOwner,
      ],
    );
    await client.query(
      `insert into categories (id, business_id, name) values
         ($1, $2, 'Dry goods'), ($3, $4, 'Their goods')`,
      [ids.category, ids.business, ids.otherCategory, ids.otherBusiness],
    );
    await client.query(
      `insert into products
         (id, business_id, category_id, name, sku, unit_of_measure, cost_price,
          is_archived)
       values
         ($1, $2, $3, 'Coffee Beans', $4, 'kg', 22.00, false),
         ($5, $2, $3, 'Oat Milk', $6, 'l', 3.50, false),
         ($7, $2, $3, 'Retired Tea', $8, 'kg', 9.00, true),
         ($9, $10, $11, 'Their Rice', $12, 'kg', 2.00, false)`,
      [
        ids.productCoffee,
        ids.business,
        ids.category,
        `STK-${suffix}-1`,
        ids.productOat,
        `STK-${suffix}-2`,
        ids.productArchived,
        `STK-${suffix}-3`,
        ids.otherProduct,
        ids.otherBusiness,
        ids.otherCategory,
        `STK-${suffix}-4`,
      ],
    );
    await client.query(
      `insert into stock_movements
         (business_id, product_id, movement_type, quantity_delta, reason, created_by)
       values
         ($1, $2, 'opening', 5, 'Opening balance', $5),
         ($1, $3, 'opening', 12, 'Opening balance', $5),
         ($1, $4, 'opening', 3, 'Opening balance', $5),
         ($6, $7, 'opening', 8, 'Opening balance', $8)`,
      [
        ids.business,
        ids.productCoffee,
        ids.productOat,
        ids.productArchived,
        ids.owner,
        ids.otherBusiness,
        ids.otherProduct,
        ids.otherOwner,
      ],
    );
    await client.query("commit");
  } finally {
    client.release();
  }
});

afterAll(async () => {
  await pool.query("delete from businesses where id = any($1::uuid[])", [
    [ids.business, ids.otherBusiness, ids.resetBusiness],
  ]);
  await pool.query("delete from auth.users where id = any($1::uuid[])", [
    [ids.owner, ids.staff, ids.viewer, ids.otherOwner, ids.resetOwner],
  ]);
  await pool.end();
});

describe("opening a stocktake", () => {
  it("snapshots one line per active product and skips archived ones", async () => {
    const session = await createSession(ids.owner, ids.business);

    expect(session.reference).toMatch(/^ST-\d{4,}$/);
    expect(session.line_count).toBe(2);

    const lines = await sheetLines(session.session_id);
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.product_id)).not.toContain(
      ids.productArchived,
    );
    expect(
      lines.find((line) => line.product_id === ids.productCoffee)
        ?.expected_quantity,
    ).toBe("5.000");
    expect(
      lines.find((line) => line.product_id === ids.productOat)
        ?.expected_quantity,
    ).toBe("12.000");

    const stored = await pool.query<{ scope: Record<string, unknown> }>(
      "select scope from stocktake_sessions where id = $1",
      [session.session_id],
    );
    expect(stored.rows[0]?.scope).toEqual({});
  });

  it("builds lines from the category and search scope it stored", async () => {
    const byCategory = await createSession(ids.owner, ids.business, {
      category_id: ids.category,
    });
    const bySearch = await createSession(ids.owner, ids.business, {
      search: "oat",
    });

    expect(byCategory.line_count).toBe(2);
    expect(bySearch.line_count).toBe(1);

    const lines = await sheetLines(bySearch.session_id);
    expect(lines[0]?.product_id).toBe(ids.productOat);

    const stored = await pool.query<{ scope: Record<string, unknown> }>(
      "select scope from stocktake_sessions where id = $1",
      [bySearch.session_id],
    );
    expect(stored.rows[0]?.scope).toEqual({ search: "oat" });
  });

  it("refuses a scope with no products, a viewer and another tenant", async () => {
    const empty = await expectRefusal(ids.owner, (client) =>
      client.query("select * from private.create_stocktake($1, $2::jsonb)", [
        ids.business,
        JSON.stringify({ search: "nothing matches this" }),
      ]),
    );
    expect(empty.code).toBe("22023");

    const viewer = await expectRefusal(ids.viewer, (client) =>
      client.query("select * from private.create_stocktake($1, $2::jsonb)", [
        ids.business,
        "{}",
      ]),
    );
    expect(viewer.code).toBe("42501");

    const foreign = await expectRefusal(ids.otherOwner, (client) =>
      client.query("select * from private.create_stocktake($1, $2::jsonb)", [
        ids.business,
        "{}",
      ]),
    );
    expect(foreign.code).toBe("P0002");
  });
});

describe("saving counts", () => {
  it("sets and clears counts, and refuses bad or foreign lines", async () => {
    const session = await createSession(ids.owner, ids.business);
    const lines = await sheetLines(session.session_id);
    const coffee = lines.find((line) => line.product_id === ids.productCoffee);
    const oat = lines.find((line) => line.product_id === ids.productOat);
    if (!coffee || !oat) throw new Error("fixture lines missing");

    await asUserCommitted(ids.staff, (client) =>
      client.query("select private.save_stocktake_counts($1, $2::jsonb)", [
        session.session_id,
        JSON.stringify([
          { line_id: coffee.id, counted: "7" },
          { line_id: oat.id, counted: "" },
        ]),
      ]),
    );

    const saved = await sheetLines(session.session_id);
    expect(saved.find((line) => line.id === coffee.id)?.counted_quantity).toBe(
      "7.000",
    );
    expect(
      saved.find((line) => line.id === oat.id)?.counted_quantity,
    ).toBeNull();

    const negative = await expectRefusal(ids.owner, (client) =>
      client.query("select private.save_stocktake_counts($1, $2::jsonb)", [
        session.session_id,
        JSON.stringify([{ line_id: coffee.id, counted: "-1" }]),
      ]),
    );
    expect(negative.code).toBe("22023");

    const word = await expectRefusal(ids.owner, (client) =>
      client.query("select private.save_stocktake_counts($1, $2::jsonb)", [
        session.session_id,
        JSON.stringify([{ line_id: coffee.id, counted: "seven" }]),
      ]),
    );
    expect(word.code).toBe("22023");

    // A line from another sheet is not silently written into this one.
    const other = await createSession(ids.owner, ids.business, {
      search: "oat",
    });
    const otherLine = (await sheetLines(other.session_id))[0];
    if (!otherLine) throw new Error("fixture line missing");
    const foreignLine = await expectRefusal(ids.owner, (client) =>
      client.query("select private.save_stocktake_counts($1, $2::jsonb)", [
        session.session_id,
        JSON.stringify([{ line_id: otherLine.id, counted: "1" }]),
      ]),
    );
    expect(foreignLine.code).toBe("22023");
  });

  it("refuses a viewer's counts", async () => {
    const session = await createSession(ids.owner, ids.business, {
      search: "oat",
    });
    const line = (await sheetLines(session.session_id))[0];
    if (!line) throw new Error("fixture line missing");

    const refused = await expectRefusal(ids.viewer, (client) =>
      client.query("select private.save_stocktake_counts($1, $2::jsonb)", [
        session.session_id,
        JSON.stringify([{ line_id: line.id, counted: "1" }]),
      ]),
    );
    expect(refused.code).toBe("42501");
  });
});

describe("completing a stocktake", () => {
  it("adjusts from the live ledger, not the snapshot", async () => {
    const session = await createSession(ids.owner, ids.business, {
      search: "coffee",
    });
    const line = (await sheetLines(session.session_id))[0];
    if (!line) throw new Error("fixture line missing");

    // Stock arrives while the sheet is on the clipboard: the count must move the
    // ledger from 8 to 6, not from the snapshot's 5.
    await asUserCommitted(ids.owner, (client) =>
      client.query(
        "select * from private.record_stock_movement($1, 'stock_in', 3, 'Delivery')",
        [ids.productCoffee],
      ),
    );
    expect(await onHand(ids.productCoffee)).toBe(8);

    const finished = await asUserCommitted(ids.owner, async (client) => {
      await client.query(
        "select private.save_stocktake_counts($1, $2::jsonb)",
        [
          session.session_id,
          JSON.stringify([{ line_id: line.id, counted: "6" }]),
        ],
      );
      const result = await client.query<{
        counted_lines: number;
        adjusted_lines: number;
        net_delta: string;
      }>("select * from private.complete_stocktake($1)", [session.session_id]);
      return result.rows[0];
    });

    expect(finished?.counted_lines).toBe(1);
    expect(finished?.adjusted_lines).toBe(1);
    expect(Number(finished?.net_delta)).toBe(-2);

    const completed = await sheetLines(session.session_id);
    expect(completed[0]?.on_hand_before).toBe("8.000");
    expect(completed[0]?.applied_delta).toBe("-2.000");
    expect(await onHand(ids.productCoffee)).toBe(6);

    const movement = await pool.query<{
      quantity_delta: string;
      reason: string;
      reference_type: string;
      reference_id: string;
    }>(
      `select quantity_delta::text, reason, reference_type, reference_id
         from stock_movements
        where business_id = $1 and reference_type = 'stocktake'
        order by created_at desc limit 1`,
      [ids.business],
    );
    expect(movement.rows[0]?.quantity_delta).toBe("-2.000");
    expect(movement.rows[0]?.reason).toContain(session.reference);
    expect(movement.rows[0]?.reference_id).toBe(session.session_id);

    const status = await pool.query<{
      status: string;
      completed_at: Date | null;
    }>("select status, completed_at from stocktake_sessions where id = $1", [
      session.session_id,
    ]);
    expect(status.rows[0]?.status).toBe("completed");
    expect(status.rows[0]?.completed_at).not.toBeNull();
  });

  it("writes no movement when the count matches the ledger", async () => {
    const session = await createSession(ids.owner, ids.business, {
      search: "oat",
    });
    const line = (await sheetLines(session.session_id))[0];
    if (!line) throw new Error("fixture line missing");

    const finished = await asUserCommitted(ids.owner, async (client) => {
      await client.query(
        "select private.save_stocktake_counts($1, $2::jsonb)",
        [
          session.session_id,
          JSON.stringify([{ line_id: line.id, counted: "12" }]),
        ],
      );
      const result = await client.query<{
        counted_lines: number;
        adjusted_lines: number;
        net_delta: string;
      }>("select * from private.complete_stocktake($1)", [session.session_id]);
      return result.rows[0];
    });

    expect(finished?.adjusted_lines).toBe(0);
    expect(Number(finished?.net_delta)).toBe(0);

    const stored = await sheetLines(session.session_id);
    expect(stored[0]?.applied_delta).toBe("0.000");
    expect(await onHand(ids.productOat)).toBe(12);

    const movements = await pool.query<{ n: number }>(
      `select count(*)::int as n from stock_movements
        where business_id = $1 and reference_type = 'stocktake'
          and reference_id = $2`,
      [ids.business, session.session_id],
    );
    expect(movements.rows[0]?.n).toBe(0);
  });

  it("refuses an empty sheet, a second completion and late counts", async () => {
    const empty = await createSession(ids.owner, ids.business, {
      search: "oat",
    });
    const uncounted = await expectRefusal(ids.owner, (client) =>
      client.query("select * from private.complete_stocktake($1)", [
        empty.session_id,
      ]),
    );
    expect(uncounted.code).toBe("22023");

    const session = await createSession(ids.owner, ids.business, {
      search: "oat",
    });
    const line = (await sheetLines(session.session_id))[0];
    if (!line) throw new Error("fixture line missing");

    await asUserCommitted(ids.owner, async (client) => {
      await client.query(
        "select private.save_stocktake_counts($1, $2::jsonb)",
        [
          session.session_id,
          JSON.stringify([{ line_id: line.id, counted: "12" }]),
        ],
      );
      await client.query("select * from private.complete_stocktake($1)", [
        session.session_id,
      ]);
    });

    const again = await expectRefusal(ids.owner, (client) =>
      client.query("select * from private.complete_stocktake($1)", [
        session.session_id,
      ]),
    );
    expect(again.code).toBe("22023");

    const lateCount = await expectRefusal(ids.owner, (client) =>
      client.query("select private.save_stocktake_counts($1, $2::jsonb)", [
        session.session_id,
        JSON.stringify([{ line_id: line.id, counted: "11" }]),
      ]),
    );
    expect(lateCount.code).toBe("22023");
  });
});

describe("stocktake boundaries", () => {
  it("hides another business's sheets", async () => {
    const session = await createSession(ids.owner, ids.business, {
      search: "oat",
    });

    const seen = await asUserCommitted(ids.otherOwner, async (client) => {
      const sessions = await client.query<{ n: number }>(
        "select count(*)::int as n from stocktake_sessions",
      );
      const lines = await client.query<{ n: number }>(
        "select count(*)::int as n from stocktake_lines",
      );
      return {
        sessions: sessions.rows[0]?.n,
        lines: lines.rows[0]?.n,
      };
    });

    expect(seen.sessions).toBe(0);
    expect(seen.lines).toBe(0);

    const completion = await expectRefusal(ids.otherOwner, (client) =>
      client.query("select * from private.complete_stocktake($1)", [
        session.session_id,
      ]),
    );
    expect(completion.code).toBe("P0002");
  });

  it("lets a demo reset clear a sheet instead of tripping over it", async () => {
    const category = randomUUID();
    await pool.query(
      `insert into categories (id, business_id, name)
       values ($1, $2, 'Before reset')`,
      [category, ids.resetBusiness],
    );
    await pool.query(
      `insert into products
         (business_id, category_id, name, sku, unit_of_measure, cost_price)
       values ($1, $2, 'Old Apples', 'OLD-1', 'kg', 1.00)`,
      [ids.resetBusiness, category],
    );

    const session = await createSession(ids.resetOwner, ids.resetBusiness);
    expect(session.line_count).toBe(1);

    // The reset must clear stocktake rows before deleting products; without the
    // two deletes it would fail on the line's product foreign key.
    await asUserCommitted(ids.resetOwner, (client) =>
      client.query("select private.reset_demo_business($1, $2::jsonb)", [
        ids.resetBusiness,
        JSON.stringify({
          categories: ["Produce"],
          suppliers: [{ name: "Reset Supplier" }],
          products: [
            {
              name: "Reset Apples",
              sku: "RST-1",
              category: "Produce",
              supplier: "Reset Supplier",
              unit: "kg",
              cost: "1.00",
              selling: "2.00",
              reorder: "0",
              opening: "0",
            },
          ],
          orders: [],
        }),
      ]),
    );

    const remaining = await pool.query<{ sessions: number; lines: number }>(
      `select
         (select count(*)::int from stocktake_sessions where business_id = $1)
           as sessions,
         (select count(*)::int from stocktake_lines where business_id = $1)
           as lines`,
      [ids.resetBusiness],
    );
    expect(remaining.rows[0]?.sessions).toBe(0);
    expect(remaining.rows[0]?.lines).toBe(0);
  });
});
