import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { databaseUrl } from "../../db/env";

/**
 * Demo reset, against real Postgres as `authenticated`.
 *
 * The function is the only place the app deletes and rebuilds a business, so these
 * tests pin what it may touch: the named business's whole dataset, nothing else,
 * and only when the caller owns it.
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
};

const PAYLOAD = {
  categories: ["Produce", "Dairy"],
  suppliers: [
    {
      name: "Test Produce",
      contact_name: "Alex Test",
      email: "produce@example.invalid",
      phone: "02 5550 0001",
      address: "1 Test Street",
      notes: "",
    },
    {
      name: "Test Dairy",
      contact_name: "Blake Test",
      email: "dairy@example.invalid",
      phone: "02 5550 0002",
      address: "2 Test Street",
      notes: "",
    },
  ],
  products: [
    {
      name: "Apples",
      sku: "TST-001",
      category: "Produce",
      supplier: "Test Produce",
      unit: "kg",
      cost: "2.00",
      selling: null,
      reorder: "5",
      opening: "10",
    },
    {
      name: "Milk",
      sku: "TST-002",
      category: "Dairy",
      supplier: "Test Dairy",
      unit: "ea",
      cost: "1.50",
      selling: "2.50",
      reorder: "4",
      opening: "0",
    },
  ],
  orders: [
    {
      orderNumber: "PO-9001",
      supplier: "Test Produce",
      status: "ordered",
      orderedDaysAgo: 1,
      expectedInDays: 2,
      notes: "Reset fixture order",
      lines: [
        { sku: "TST-001", quantity: 6 },
        { sku: "TST-002", quantity: 2 },
      ],
    },
  ],
};

async function asUser<T>(
  userId: string | null,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(userId ? { sub: userId } : {}),
    ]);
    return await fn(client);
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
  }
}

function reset(
  client: PoolClient,
  payload: unknown = PAYLOAD,
  businessId = ids.business,
) {
  return client.query<{ reset: Record<string, number> }>(
    "select private.reset_demo_business($1, $2::jsonb) as reset",
    [businessId, JSON.stringify(payload)],
  );
}

/** Run a statement expected to fail, keeping the transaction usable. */
async function refusal(
  client: PoolClient,
  payload: unknown = PAYLOAD,
): Promise<{ code?: string; message?: string }> {
  let caught: { code?: string; message?: string } | null = null;
  await client.query("savepoint probe");
  try {
    await reset(client, payload);
  } catch (error) {
    caught = error as { code?: string; message?: string };
  }
  await client.query("rollback to savepoint probe");
  if (!caught) throw new Error("expected the reset to be refused");
  return caught;
}

async function countsFor(businessId: string) {
  const result = await pool.query<{
    products: number;
    suppliers: number;
    categories: number;
    orders: number;
    lines: number;
    movements: number;
  }>(
    `select
       (select count(*)::int from products where business_id = $1) as products,
       (select count(*)::int from suppliers where business_id = $1) as suppliers,
       (select count(*)::int from categories where business_id = $1) as categories,
       (select count(*)::int from purchase_orders where business_id = $1) as orders,
       (select count(*)::int from purchase_order_lines where business_id = $1) as lines,
       (select count(*)::int from stock_movements where business_id = $1) as movements`,
    [businessId],
  );
  return result.rows[0];
}

beforeAll(async () => {
  await pool.query(
    "insert into auth.users (id, email) select id, 'reset-' || id || '@example.invalid' from unnest($1::uuid[]) as t(id)",
    [[ids.owner, ids.staff, ids.viewer, ids.stranger, ids.otherOwner]],
  );

  await pool.query(
    `insert into businesses (id, name, business_type, currency_code)
     values ($1, 'Reset Test Cafe', 'cafe', 'AUD'),
            ($2, 'Reset Test Other', 'cafe', 'AUD')`,
    [ids.business, ids.otherBusiness],
  );

  await pool.query(
    `insert into business_members (business_id, user_id, role)
     values ($1, $2, 'owner'), ($1, $3, 'staff'), ($1, $4, 'viewer'),
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

  // A pre-reset dataset: a product that the payload does not contain, plus one
  // order line so the deletes have something real to remove.
  await pool.query(
    `insert into categories (business_id, name) values ($1, 'Old Category')`,
    [ids.business],
  );
  await pool.query(
    `insert into suppliers (business_id, name, email)
     values ($1, 'Old Supplier', 'old@example.invalid')`,
    [ids.business],
  );
  await pool.query(
    `insert into products (business_id, name, sku, unit_of_measure, cost_price,
                           reorder_level)
     values ($1, 'Old product', 'OLD-001', 'ea', 3.00, 1)`,
    [ids.business],
  );
  await pool.query(
    `insert into purchase_orders (business_id, supplier_id, order_number, status)
     select $1, s.id, 'PO-8001', 'draft'
       from suppliers s
      where s.business_id = $1 and s.name = 'Old Supplier'`,
    [ids.business],
  );

  await pool.query(
    `insert into products (business_id, name, sku, unit_of_measure, cost_price,
                           reorder_level)
     values ($1, 'Other business product', 'OTH-001', 'ea', 1.00, 1)`,
    [ids.otherBusiness],
  );
});

afterAll(async () => {
  for (const businessId of [ids.business, ids.otherBusiness]) {
    await pool.query(
      "delete from purchase_receipt_lines where business_id = $1",
      [businessId],
    );
    await pool.query("delete from purchase_receipts where business_id = $1", [
      businessId,
    ]);
    await pool.query(
      "delete from purchase_order_lines where business_id = $1",
      [businessId],
    );
    await pool.query("delete from purchase_orders where business_id = $1", [
      businessId,
    ]);
    await pool.query("delete from stock_movements where business_id = $1", [
      businessId,
    ]);
    await pool.query("delete from products where business_id = $1", [
      businessId,
    ]);
    await pool.query("delete from suppliers where business_id = $1", [
      businessId,
    ]);
    await pool.query("delete from categories where business_id = $1", [
      businessId,
    ]);
    await pool.query("delete from business_members where business_id = $1", [
      businessId,
    ]);
  }
  await pool.query("delete from businesses where id = any($1::uuid[])", [
    [ids.business, ids.otherBusiness],
  ]);
  await pool.query("delete from auth.users where id = any($1::uuid[])", [
    [ids.owner, ids.staff, ids.viewer, ids.stranger, ids.otherOwner],
  ]);
  await pool.end();
});

describe("private.reset_demo_business", () => {
  it("rebuilds the business from the payload and reports what it wrote", async () => {
    await asUser(ids.owner, async (client) => {
      const result = await reset(client);
      expect(result.rows[0].reset).toEqual({
        categories: 2,
        suppliers: 2,
        products: 2,
        orders: 1,
        lines: 2,
        movements: 1,
      });

      const products = await client.query<{
        sku: string;
        on_hand: string;
        selling_price: string | null;
      }>(
        `select p.sku, coalesce(st.on_hand, 0)::text as on_hand,
                p.selling_price::text as selling_price
           from products p
           left join product_stock st
             on st.business_id = p.business_id and st.product_id = p.id
          where p.business_id = $1
          order by p.sku`,
        [ids.business],
      );
      expect(products.rows).toEqual([
        { sku: "TST-001", on_hand: "10.000", selling_price: null },
        { sku: "TST-002", on_hand: "0", selling_price: "2.50" },
      ]);

      const links = await client.query<{
        sku: string;
        supplier: string;
        is_default: boolean;
      }>(
        `select p.sku, s.name as supplier, ps.is_default
           from product_suppliers ps
           join products p
             on p.business_id = ps.business_id and p.id = ps.product_id
           join suppliers s
             on s.business_id = ps.business_id and s.id = ps.supplier_id
          where ps.business_id = $1
          order by p.sku`,
        [ids.business],
      );
      expect(links.rows).toEqual([
        { sku: "TST-001", supplier: "Test Produce", is_default: true },
        { sku: "TST-002", supplier: "Test Dairy", is_default: true },
      ]);

      const order = await client.query<{
        status: string;
        ordered_at: Date | null;
        expected: string;
        lines: number;
        value: string;
      }>(
        `select po.status, po.ordered_at,
                po.expected_delivery_at::text as expected,
                count(l.id)::int as lines,
                sum(l.quantity_ordered * l.unit_cost)::text as value
           from purchase_orders po
           join purchase_order_lines l on l.purchase_order_id = po.id
          where po.business_id = $1 and po.order_number = 'PO-9001'
          group by po.id`,
        [ids.business],
      );
      expect(order.rows[0].status).toBe("ordered");
      expect(order.rows[0].ordered_at).not.toBeNull();
      expect(order.rows[0].lines).toBe(2);
      expect(Number(order.rows[0].value)).toBeCloseTo(15, 2);

      const gone = await client.query(
        "select 1 from products where business_id = $1 and sku = 'OLD-001'",
        [ids.business],
      );
      expect(gone.rowCount).toBe(0);
    });
  });

  it("leaves another business untouched", async () => {
    await asUser(ids.owner, async (client) => {
      await reset(client);
    });

    const other = await countsFor(ids.otherBusiness);
    expect(other.products).toBe(1);
    expect(other.categories).toBe(0);
  });

  it("refuses staff, viewers and strangers with the same message", async () => {
    for (const userId of [ids.staff, ids.viewer, ids.stranger]) {
      await asUser(userId, async (client) => {
        const error = await refusal(client);
        expect(error.code).toBe("42501");
        expect(error.message).toBe(
          "Only an owner can reset this business's data.",
        );
      });
    }

    // A refused caller changes nothing; check with the owner connection, because
    // a non-member cannot see the rows at all through RLS.
    const kept = await pool.query(
      "select 1 from products where business_id = $1 and sku = 'OLD-001'",
      [ids.business],
    );
    expect(kept.rowCount).toBe(1);
  });

  it("refuses a request with no signed-in user", async () => {
    await asUser(null, async (client) => {
      const error = await refusal(client);
      expect(error.code).toBe("42501");
      expect(error.message).toBe("Sign in to reset demo data.");
    });
  });

  it("rolls back when an order line names an unknown product", async () => {
    const broken = {
      ...PAYLOAD,
      orders: [
        {
          ...PAYLOAD.orders[0],
          lines: [
            { sku: "TST-001", quantity: 6 },
            { sku: "NOPE", quantity: 1 },
          ],
        },
      ],
    };

    await asUser(ids.owner, async (client) => {
      const error = await refusal(client, broken);
      expect(error.code).toBe("22023");

      const stillThere = await client.query(
        "select 1 from products where business_id = $1 and sku = 'OLD-001'",
        [ids.business],
      );
      expect(stillThere.rowCount).toBe(1);
    });
  });

  it("rejects a payload that is not an object", async () => {
    await asUser(ids.owner, async (client) => {
      const error = await refusal(client, ["not", "an", "object"]);
      expect(error.code).toBe("22023");
    });
  });
});
