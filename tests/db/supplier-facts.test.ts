import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { databaseUrl } from "../../db/env";

/**
 * Slice A against real Postgres as `authenticated`: the supplier lead-time bound,
 * the per-supplier code index and the last-paid view built from receipts.
 *
 * The view is the part worth proving at the database boundary: it derives from
 * three tables the application role cannot write directly, and its
 * `security_invoker` setting has to keep one tenant's prices out of another's.
 */
const pool = new Pool({ connectionString: databaseUrl(), max: 4 });

const ids = {
  business: randomUUID(),
  otherBusiness: randomUUID(),
  owner: randomUUID(),
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

/** Receipts must be committed, because received_at is per transaction. */
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
): Promise<{ code: string; constraint: string }> {
  await client.query("savepoint attempt");
  try {
    await run();
    await client.query("release savepoint attempt");
    return { code: "", constraint: "" };
  } catch (error) {
    await client.query("rollback to savepoint attempt");
    return {
      code: (error as { code?: string }).code ?? "",
      constraint: (error as { constraint?: string }).constraint ?? "",
    };
  }
}

/** Order one line, mark it ordered, receive it — the way the app does. */
async function orderAndReceive(
  client: PoolClient,
  options: {
    supplierId: string;
    productId: string;
    quantity: string;
    unitCost: string;
    businessId?: string;
  },
): Promise<string> {
  sequence += 1;
  const businessId = options.businessId ?? ids.business;
  const order = await client.query<{ id: string }>(
    `insert into purchase_orders (business_id, supplier_id, order_number)
     values ($1, $2, $3)
     returning id`,
    [
      businessId,
      options.supplierId,
      `PO-A-${String(sequence).padStart(4, "0")}`,
    ],
  );
  const orderId = order.rows[0].id;
  const line = await client.query<{ id: string }>(
    `insert into purchase_order_lines
       (business_id, purchase_order_id, product_id, quantity_ordered, unit_cost)
     values ($1, $2, $3, $4::numeric, $5::numeric)
     returning id`,
    [
      businessId,
      orderId,
      options.productId,
      options.quantity,
      options.unitCost,
    ],
  );
  await client.query(
    "select private.set_purchase_order_status($1, 'ordered')",
    [orderId],
  );
  await client.query(
    `select receipt_id, status
       from private.receive_purchase_order($1, $2::jsonb, $3::uuid)`,
    [
      orderId,
      JSON.stringify([
        {
          purchase_order_line_id: line.rows[0].id,
          received: options.quantity,
          accepted: options.quantity,
          damaged: "0",
          rejected: "0",
        },
      ]),
      randomUUID(),
    ],
  );
  return orderId;
}

beforeAll(async () => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into businesses (id, name, business_type)
       values ($1, 'Facts Cafe', 'cafe'), ($2, 'Facts Shop', 'retail')`,
      [ids.business, ids.otherBusiness],
    );
    await client.query(
      `insert into auth.users (id, email) values ($1, $2), ($3, $4)`,
      [
        ids.owner,
        `facts-owner-${ids.business}@test.invalid`,
        ids.otherOwner,
        `facts-owner-${ids.otherBusiness}@test.invalid`,
      ],
    );
    await client.query(
      `insert into business_members (business_id, user_id, role) values
         ($1, $2, 'owner'), ($3, $4, 'owner')`,
      [ids.business, ids.owner, ids.otherBusiness, ids.otherOwner],
    );
    await client.query(
      `insert into suppliers (id, business_id, name, lead_time_days) values
         ($1, $2, 'Facts Produce', 2),
         ($3, $2, 'Facts Dairy', null),
         ($4, $5, 'Other Produce', null)`,
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
       values ($1, $2, 'Tomatoes', 'FACT-1', 'kg', 4.20),
              ($3, $2, 'Milk', 'FACT-2', 'bottle', 3.10),
              ($4, $5, 'Other beans', 'FACT-3', 'kg', 20.00)`,
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
  await pool.query(
    "delete from purchase_receipts where business_id = any($1::uuid[])",
    [[ids.business, ids.otherBusiness]],
  );
  await pool.query("delete from businesses where id = any($1::uuid[])", [
    [ids.business, ids.otherBusiness],
  ]);
  await pool.query("delete from auth.users where id = any($1::uuid[])", [
    [ids.owner, ids.otherOwner],
  ]);
  await pool.end();
});

describe("supplier lead time", () => {
  it("accepts 0 to 365 days and refuses anything outside", async () => {
    const result = await asUser(ids.owner, async (client) => {
      await client.query(
        "update suppliers set lead_time_days = 0 where id = $1",
        [ids.supplier],
      );
      await client.query(
        "update suppliers set lead_time_days = 365 where id = $1",
        [ids.supplier],
      );
      const stored = await client.query<{ lead_time_days: number }>(
        "select lead_time_days from suppliers where id = $1",
        [ids.supplier],
      );
      const tooLong = await captureError(client, () =>
        client.query(
          "update suppliers set lead_time_days = 366 where id = $1",
          [ids.supplier],
        ),
      );
      const negative = await captureError(client, () =>
        client.query("update suppliers set lead_time_days = -1 where id = $1", [
          ids.supplier,
        ]),
      );
      return {
        stored: stored.rows[0]?.lead_time_days,
        tooLong,
        negative,
      };
    });

    expect(result.stored).toBe(365);
    expect(result.tooLong).toMatchObject({
      code: "23514",
      constraint: "suppliers_lead_time_days_check",
    });
    expect(result.negative.code).toBe("23514");
  });

  it("leaves an unknown lead time null", async () => {
    const result = await asUser(ids.owner, async (client) => {
      const stored = await client.query<{ lead_time_days: number | null }>(
        "select lead_time_days from suppliers where id = $1",
        [ids.secondSupplier],
      );
      return stored.rows[0]?.lead_time_days;
    });

    expect(result).toBeNull();
  });
});

describe("product supplier links", () => {
  it("allows one active default per product", async () => {
    const result = await asUser(ids.owner, async (client) => {
      await client.query(
        `insert into product_suppliers
           (business_id, product_id, supplier_id, is_default)
         values ($1, $2, $3, true)`,
        [ids.business, ids.product, ids.supplier],
      );
      const secondDefault = await captureError(client, () =>
        client.query(
          `insert into product_suppliers
             (business_id, product_id, supplier_id, is_default)
           values ($1, $2, $3, true)`,
          [ids.business, ids.product, ids.secondSupplier],
        ),
      );
      const duplicateLink = await captureError(client, () =>
        client.query(
          `insert into product_suppliers
             (business_id, product_id, supplier_id)
           values ($1, $2, $3)`,
          [ids.business, ids.product, ids.supplier],
        ),
      );
      return { secondDefault, duplicateLink };
    });

    expect(result.secondDefault).toMatchObject({
      code: "23505",
      constraint: "product_suppliers_one_default",
    });
    expect(result.duplicateLink).toMatchObject({
      code: "23505",
      constraint: "product_suppliers_business_product_supplier_key",
    });
  });

  it("keeps a supplier code unique per supplier, ignoring case", async () => {
    const result = await asUser(ids.owner, async (client) => {
      await client.query(
        `insert into product_suppliers
           (business_id, product_id, supplier_id, supplier_sku, is_default)
         values ($1, $2, $3, 'FF-100', true)`,
        [ids.business, ids.product, ids.supplier],
      );
      const duplicate = await captureError(client, () =>
        client.query(
          `insert into product_suppliers
             (business_id, product_id, supplier_id, supplier_sku)
           values ($1, $2, $3, 'ff-100')`,
          [ids.business, ids.secondProduct, ids.supplier],
        ),
      );
      // The same code at a different supplier is a different code.
      await client.query(
        `insert into product_suppliers
           (business_id, product_id, supplier_id, supplier_sku)
         values ($1, $2, $3, 'FF-100')`,
        [ids.business, ids.secondProduct, ids.secondSupplier],
      );
      const codes = await client.query<{
        sku: string;
        supplier_name: string;
        supplier_sku: string | null;
      }>(
        `select p.sku, s.name as supplier_name, ps.supplier_sku
           from product_suppliers ps
           join products p
             on p.business_id = ps.business_id and p.id = ps.product_id
           join suppliers s
             on s.business_id = ps.business_id and s.id = ps.supplier_id
          where ps.business_id = $1
          order by p.sku, s.name`,
        [ids.business],
      );
      return { duplicate, codes: codes.rows };
    });

    expect(result.duplicate).toMatchObject({
      code: "23505",
      constraint: "product_suppliers_code_key",
    });
    expect(result.codes).toEqual([
      { sku: "FACT-1", supplier_name: "Facts Produce", supplier_sku: "FF-100" },
      { sku: "FACT-2", supplier_name: "Facts Dairy", supplier_sku: "FF-100" },
    ]);
  });

  it("accepts a lead time from 0 to 365 days and a code that can be cleared", async () => {
    const result = await asUser(ids.owner, async (client) => {
      await client.query(
        `insert into product_suppliers
           (business_id, product_id, supplier_id, supplier_sku, lead_time_days,
            is_default)
         values ($1, $2, $3, 'FF-300', 0, true)`,
        [ids.business, ids.product, ids.supplier],
      );
      await client.query(
        `update product_suppliers set lead_time_days = 365
          where business_id = $1 and product_id = $2`,
        [ids.business, ids.product],
      );
      const tooLong = await captureError(client, () =>
        client.query(
          `update product_suppliers set lead_time_days = 366
            where business_id = $1 and product_id = $2`,
          [ids.business, ids.product],
        ),
      );
      const cleared = await client.query<{
        lead_time_days: number | null;
        supplier_sku: string | null;
      }>(
        `update product_suppliers set supplier_sku = null, lead_time_days = null
          where business_id = $1 and product_id = $2
          returning lead_time_days, supplier_sku`,
        [ids.business, ids.product],
      );
      return { tooLong, cleared: cleared.rows[0] };
    });

    expect(result.tooLong).toMatchObject({
      code: "23514",
      constraint: "product_suppliers_lead_time_days_check",
    });
    expect(result.cleared).toEqual({
      lead_time_days: null,
      supplier_sku: null,
    });
  });
});

describe("product_last_price", () => {
  it("reports the most recent receipt's cost for the product and supplier", async () => {
    const firstOrder = await asUserCommitted(ids.owner, (client) =>
      orderAndReceive(client, {
        supplierId: ids.supplier,
        productId: ids.product,
        quantity: "4",
        unitCost: "4.20",
      }),
    );
    // A second, later transaction: received_at is the transaction timestamp, so
    // two receives in one transaction would tie.
    await new Promise((resolve) => setTimeout(resolve, 25));
    await asUserCommitted(ids.owner, (client) =>
      orderAndReceive(client, {
        supplierId: ids.supplier,
        productId: ids.product,
        quantity: "6",
        unitCost: "4.65",
      }),
    );

    const result = await asUser(ids.owner, async (client) => {
      const rows = await client.query<{
        business_id: string;
        product_id: string;
        supplier_id: string;
        unit_cost: string;
        received_at: Date;
      }>(
        `select business_id, product_id, supplier_id, unit_cost, received_at
           from product_last_price
          where product_id = $1`,
        [ids.product],
      );
      const history = await client.query<{ n: number; latest: string }>(
        `select count(*)::int as n, max(rl.unit_cost)::text as latest
           from purchase_receipt_lines rl
           join purchase_order_lines pol
             on pol.business_id = rl.business_id
            and pol.id = rl.purchase_order_line_id
          where pol.product_id = $1`,
        [ids.product],
      );
      return { rows: rows.rows, history: history.rows[0], firstOrder };
    });

    // One row per product and supplier, however many receipts exist.
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      business_id: ids.business,
      product_id: ids.product,
      supplier_id: ids.supplier,
      unit_cost: "4.65",
    });
    expect(Number(result.rows[0].received_at)).toBeGreaterThan(0);
    expect(result.history).toMatchObject({ n: 2, latest: "4.65" });
    expect(result.firstOrder).toBeTruthy();
  });

  it("shows one tenant's prices to nobody else", async () => {
    const result = await asUser(ids.otherOwner, async (client) => {
      const foreign = await client.query<{ n: number }>(
        "select count(*)::int as n from product_last_price where business_id = $1",
        [ids.business],
      );
      const own = await client.query<{ n: number }>(
        "select count(*)::int as n from product_last_price where business_id = $1",
        [ids.otherBusiness],
      );
      return { foreign: foreign.rows[0]?.n, own: own.rows[0]?.n };
    });

    expect(result).toEqual({ foreign: 0, own: 0 });
  });
});
