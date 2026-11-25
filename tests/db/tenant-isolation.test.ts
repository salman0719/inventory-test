import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { databaseUrl } from "../../db/env";

/**
 * Database integration tests. These are the checks that cannot be faked with a
 * mock: they run real migrations against Postgres, then act as the `authenticated`
 * role with a JWT subject, exactly as the application will.
 *
 * Run with `npm run test:db` (vitest.db.config.ts). CI runs it after migrating.
 */
const pool = new Pool({ connectionString: databaseUrl(), max: 4 });

const ids = {
  businessA: randomUUID(),
  businessB: randomUUID(),
  ownerA: randomUUID(),
  ownerB: randomUUID(),
  staffA: randomUUID(),
  stranger: randomUUID(),
  supplierA: randomUUID(),
  supplierB: randomUUID(),
  productA: randomUUID(),
  productB: randomUUID(),
  orderA: randomUUID(),
};

/** Run a query as an authenticated user, with claims set the way the app will. */
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

beforeAll(async () => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into businesses (id, name, business_type) values ($1, 'Test Cafe', 'cafe'), ($2, 'Test Shop', 'retail')`,
      [ids.businessA, ids.businessB],
    );
    await client.query(
      `insert into auth.users (id, email) values ($1, $2), ($3, $4), ($5, $6), ($7, $8)`,
      [
        ids.ownerA,
        `owner-a-${ids.businessA}@test.invalid`,
        ids.ownerB,
        `owner-b-${ids.businessB}@test.invalid`,
        ids.staffA,
        `staff-a-${ids.businessA}@test.invalid`,
        ids.stranger,
        `stranger-${ids.stranger}@test.invalid`,
      ],
    );
    await client.query(
      `insert into business_members (business_id, user_id, role) values
         ($1, $2, 'owner'), ($3, $4, 'owner'), ($1, $5, 'staff')`,
      [ids.businessA, ids.ownerA, ids.businessB, ids.ownerB, ids.staffA],
    );
    await client.query(
      `insert into suppliers (id, business_id, name) values ($1, $2, 'Supplier A'), ($3, $4, 'Supplier B')`,
      [ids.supplierA, ids.businessA, ids.supplierB, ids.businessB],
    );
    await client.query(
      `insert into products (id, business_id, name, sku, cost_price, reorder_level)
       values ($1, $2, 'Product A', 'SKU-A', 2.50, 5),
              ($3, $4, 'Product B', 'SKU-B', 9.00, 2)`,
      [ids.productA, ids.businessA, ids.productB, ids.businessB],
    );
    await client.query(
      `insert into product_suppliers
         (business_id, product_id, supplier_id, is_default)
       values ($1, $2, $3, true), ($4, $5, $6, true)`,
      [
        ids.businessA,
        ids.productA,
        ids.supplierA,
        ids.businessB,
        ids.productB,
        ids.supplierB,
      ],
    );
    await client.query(
      `insert into stock_movements (business_id, product_id, movement_type, quantity_delta, reason)
       values ($1, $2, 'opening', 15, 'opening balance'),
              ($3, $4, 'opening', 4, 'opening balance')`,
      [ids.businessA, ids.productA, ids.businessB, ids.productB],
    );
    await client.query(
      `insert into purchase_orders (id, business_id, supplier_id, order_number, status)
       values ($1, $2, $3, 'PO-TEST-A', 'ordered')`,
      [ids.orderA, ids.businessA, ids.supplierA],
    );
    await client.query("commit");
  } finally {
    client.release();
  }
});

afterAll(async () => {
  await pool.query("delete from businesses where id = any($1::uuid[])", [
    [ids.businessA, ids.businessB],
  ]);
  await pool.query("delete from auth.users where id = any($1::uuid[])", [
    [ids.ownerA, ids.ownerB, ids.staffA, ids.stranger],
  ]);
  await pool.end();
});

describe("tenant isolation", () => {
  it("lists only the businesses the user belongs to", async () => {
    const rows = await asUser(ids.ownerA, async (client) => {
      const result = await client.query<{ id: string; name: string }>(
        "select id, name from businesses order by name",
      );
      return result.rows;
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(ids.businessA);
    expect(rows.some((row) => row.id === ids.businessB)).toBe(false);
  });

  it("returns no products, stock or orders from another business", async () => {
    const seen = await asUser(ids.ownerA, async (client) => {
      const products = await client.query<{ id: string }>(
        "select id from products",
      );
      const stock = await client.query<{ product_id: string; on_hand: string }>(
        "select product_id, on_hand from product_stock",
      );
      const orders = await client.query<{ id: string }>(
        "select id from purchase_orders",
      );
      const otherBusiness = await client.query<{ id: string }>(
        "select id from products where business_id = $1",
        [ids.businessB],
      );
      return {
        products: products.rows,
        stock: stock.rows,
        orders: orders.rows,
        otherBusiness: otherBusiness.rows,
      };
    });

    expect(seen.products.map((row) => row.id)).toEqual([ids.productA]);
    expect(seen.stock).toHaveLength(1);
    expect(seen.stock[0]?.product_id).toBe(ids.productA);
    expect(Number(seen.stock[0]?.on_hand)).toBe(15);
    expect(seen.orders).toHaveLength(1);
    // Not merely hidden by a filter: the database returns nothing for B's rows.
    expect(seen.otherBusiness).toHaveLength(0);
  });

  it("shows nothing to a signed-in user with no membership", async () => {
    const counts = await asUser(ids.stranger, async (client) => {
      const businesses = await client.query("select id from businesses");
      const products = await client.query("select id from products");
      const stock = await client.query("select product_id from product_stock");
      const orders = await client.query("select id from purchase_orders");
      return {
        businesses: businesses.rowCount,
        products: products.rowCount,
        stock: stock.rowCount,
        orders: orders.rowCount,
      };
    });

    expect(counts).toEqual({ businesses: 0, products: 0, stock: 0, orders: 0 });
  });
});

describe("ledger write protection", () => {
  it("rejects a direct stock movement insert from an owner", async () => {
    await expect(
      asUser(ids.ownerA, (client) =>
        client.query(
          `insert into stock_movements (business_id, product_id, movement_type, quantity_delta, reason)
           values ($1, $2, 'adjustment', 1, 'direct write')`,
          [ids.businessA, ids.productA],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("rejects direct receipt and receipt-line inserts", async () => {
    await expect(
      asUser(ids.ownerA, (client) =>
        client.query(
          `insert into purchase_receipts (business_id, purchase_order_id, idempotency_key)
           values ($1, $2, $3)`,
          [ids.businessA, ids.orderA, randomUUID()],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("grants authenticated no write privilege on the ledger or receipts", async () => {
    // A denial can come from a missing grant or from RLS; this asserts the grant
    // itself, so removing the revoke cannot quietly pass.
    const result = await pool.query<{
      table_name: string;
      privilege_type: string;
    }>(
      `select table_name, privilege_type
       from information_schema.role_table_grants
       where grantee = 'authenticated'
         and table_name = any($1::text[])
         and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
       order by table_name, privilege_type`,
      [["stock_movements", "purchase_receipts", "purchase_receipt_lines"]],
    );

    expect(result.rows).toEqual([]);
  });

  it("does not let an owner rewrite or delete an existing movement", async () => {
    await expect(
      asUser(ids.ownerA, (client) =>
        client.query(
          "update stock_movements set quantity_delta = 999 where product_id = $1",
          [ids.productA],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });

    await expect(
      asUser(ids.ownerA, (client) =>
        client.query("delete from stock_movements where product_id = $1", [
          ids.productA,
        ]),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

describe("supplier links", () => {
  it("reads and writes only links inside the caller's business", async () => {
    const result = await asUser(ids.ownerA, async (client) => {
      const foreign = await client.query<{ total: number }>(
        "select count(*)::int as total from product_suppliers where business_id = $1",
        [ids.businessB],
      );
      const own = await client.query<{ total: number }>(
        "select count(*)::int as total from product_suppliers where business_id = $1",
        [ids.businessA],
      );
      const refused = await client.query("savepoint link_attempt").then(() =>
        client
          .query(
            `insert into product_suppliers
                 (business_id, product_id, supplier_id, is_default)
               values ($1, $2, $3, false)`,
            [ids.businessB, ids.productB, ids.supplierB],
          )
          .then(() => null)
          .catch(async (error: { code?: string }) => {
            await client.query("rollback to savepoint link_attempt");
            return error.code ?? "";
          }),
      );
      return {
        foreign: foreign.rows[0]?.total,
        own: own.rows[0]?.total,
        refused,
      };
    });

    expect(result.foreign).toBe(0);
    expect(result.own).toBe(1);
    expect(result.refused).toBe("42501");
  });
});

describe("catalogue writes stay inside the business", () => {
  it("lets staff add a product to their own business", async () => {
    const sku = `STAFF-${randomUUID().slice(0, 8)}`;
    const createdAt = await asUser(ids.staffA, async (client) => {
      await client.query(
        `insert into products (business_id, name, sku) values ($1, 'Staff product', $2)`,
        [ids.businessA, sku],
      );
      const result = await client.query<{ business_id: string }>(
        "select business_id from products where sku = $1",
        [sku],
      );
      return result.rows[0]?.business_id;
    });

    expect(createdAt).toBe(ids.businessA);
    await pool.query("delete from products where sku = $1", [sku]);
  });

  it("refuses a product written into another business", async () => {
    await expect(
      asUser(ids.staffA, (client) =>
        client.query(
          `insert into products (business_id, name, sku) values ($1, 'Leak', $2)`,
          [ids.businessB, `LEAK-${randomUUID().slice(0, 8)}`],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
});
