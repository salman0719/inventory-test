import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { databaseUrl } from "../../db/env";
import { getReorderPage, saveReorderSelection } from "../../src/lib/reorder";
import { suggestedDeliveryDate } from "../../src/lib/purchase-order-input";

/**
 * Reorder suggestions against real Postgres as `authenticated`.
 *
 * The formula itself is unit-tested; what needs a database is where its inputs
 * come from: on-order counts only sent orders, a draft is not on-order but is
 * marked, and creating from a selection extends the supplier's draft rather than
 * opening a rival order.
 */
const pool = new Pool({ connectionString: databaseUrl(), max: 4 });

const ids = {
  business: randomUUID(),
  otherBusiness: randomUUID(),
  owner: randomUUID(),
  viewer: randomUUID(),
  otherOwner: randomUUID(),
  supplierA: randomUUID(),
  supplierB: randomUUID(),
  supplierC: randomUUID(),
  supplierD: randomUUID(),
  productA: randomUUID(),
  productB: randomUUID(),
  productC: randomUUID(),
  productD: randomUUID(),
  productE: randomUUID(),
  productF: randomUUID(),
  productNoSupplier: randomUUID(),
  productArchived: randomUUID(),
  orderedOrder: randomUUID(),
  draftOrder: randomUUID(),
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

beforeAll(async () => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into businesses (id, name, business_type)
       values ($1, 'Reorder Cafe', 'cafe'), ($2, 'Reorder Shop', 'retail')`,
      [ids.business, ids.otherBusiness],
    );
    await client.query(
      `insert into auth.users (id, email) values
         ($1, $2), ($3, $4), ($5, $6)`,
      [
        ids.owner,
        `reorder-owner-${randomUUID().slice(0, 8)}@test.invalid`,
        ids.viewer,
        `reorder-viewer-${randomUUID().slice(0, 8)}@test.invalid`,
        ids.otherOwner,
        `reorder-other-${randomUUID().slice(0, 8)}@test.invalid`,
      ],
    );
    await client.query(
      `insert into business_members (business_id, user_id, role) values
         ($1, $2, 'owner'), ($1, $3, 'viewer'), ($4, $5, 'owner')`,
      [ids.business, ids.owner, ids.viewer, ids.otherBusiness, ids.otherOwner],
    );
    await client.query(
      `insert into suppliers (id, business_id, name, lead_time_days) values
         ($1, $2, 'Reorder Produce', 2),
         ($3, $2, 'Reorder Dairy', null),
         ($4, $2, 'Reorder Dry Goods', 1),
         ($5, $2, 'Reorder Bakery', 0)`,
      [
        ids.supplierA,
        ids.business,
        ids.supplierB,
        ids.supplierC,
        ids.supplierD,
      ],
    );
    await client.query(
      `insert into products
         (id, business_id, name, sku, unit_of_measure, cost_price,
          reorder_level, target_stock_level, is_archived)
       values
         ($1, $2, 'Reorder Tomatoes', 'REO-1', 'kg', 2.00, 4, null, false),
         ($3, $2, 'Reorder Cucumbers', 'REO-2', 'ea', 1.00, 4, 3, false),
         ($4, $2, 'Reorder Milk', 'REO-3', 'bottle', 3.10, 6, 10, false),
         ($5, $2, 'Reorder Cream', 'REO-4', 'ea', 2.20, 4, 5, false),
         ($6, $2, 'Reorder Flour', 'REO-5', 'bag', 9.00, 2, null, false),
         ($7, $2, 'Reorder Buns', 'REO-6', 'pack', 3.20, 2, null, false),
         ($8, $2, 'Reorder Loose Apples', 'REO-7', 'kg', 3.00, 2, null, false),
         ($9, $2, 'Reorder Retired Tea', 'REO-8', 'box', 5.00, 2, null, true)`,
      [
        ids.productA,
        ids.business,
        ids.productB,
        ids.productC,
        ids.productD,
        ids.productE,
        ids.productF,
        ids.productNoSupplier,
        ids.productArchived,
      ],
    );
    await client.query(
      `insert into product_suppliers
         (business_id, product_id, supplier_id, is_default)
       values
         ($1, $2, $3, true),
         ($1, $4, $3, true),
         ($1, $5, $6, true),
         ($1, $7, $6, true),
         ($1, $8, $9, true),
         ($1, $10, $11, true),
         ($1, $12, $3, true)`,
      [
        ids.business,
        ids.productA,
        ids.supplierA,
        ids.productB,
        ids.productC,
        ids.supplierB,
        ids.productD,
        ids.productE,
        ids.supplierC,
        ids.productF,
        ids.supplierD,
        ids.productArchived,
      ],
    );
    await client.query(
      `insert into stock_movements
         (business_id, product_id, movement_type, quantity_delta, reason, created_by)
       values
         ($1, $2, 'opening', 2, 'Opening balance', $5),
         ($1, $3, 'opening', 1, 'Opening balance', $5),
         ($1, $4, 'opening', 0.5, 'Opening balance', $5)`,
      [ids.business, ids.productA, ids.productC, ids.productE, ids.owner],
    );

    // Supplier A's order has been sent: its quantity is on order and the group is
    // read-only. Supplier B's order is still a draft: it must not count as on order.
    await client.query(
      `insert into purchase_orders
         (id, business_id, supplier_id, order_number, status, ordered_at)
       values
         ($1, $2, $3, 'PO-R-0001', 'ordered', now()),
         ($4, $2, $5, 'PO-R-0002', 'draft', null)`,
      [
        ids.orderedOrder,
        ids.business,
        ids.supplierA,
        ids.draftOrder,
        ids.supplierB,
      ],
    );
    await client.query(
      `insert into purchase_order_lines
         (business_id, purchase_order_id, product_id, quantity_ordered, unit_cost)
       values
         ($1, $2, $3, 2, 2.00),
         ($1, $4, $5, 5, 3.10)`,
      [
        ids.business,
        ids.orderedOrder,
        ids.productA,
        ids.draftOrder,
        ids.productC,
      ],
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
    [ids.owner, ids.viewer, ids.otherOwner],
  ]);
  await pool.end();
});

describe("reading suggestions", () => {
  it("subtracts sent orders but not drafts, and marks a draft line", async () => {
    const page = await asUser(ids.owner, (client) =>
      getReorderPage(ids.owner, ids.business, client),
    );

    // Produce, Dairy, Dry Goods and Bakery all have a product below target.
    expect(page.supplierCount).toBe(4);
    expect(page.productCount).toBe(6);
    expect(page.unassignedCount).toBe(1);

    const produce = page.groups.find(
      (group) => group.supplierId === ids.supplierA,
    );
    if (!produce) throw new Error("Produce group missing");
    expect(produce.openOrder).toMatchObject({
      orderNumber: "PO-R-0001",
      status: "ordered",
    });
    const tomatoes = produce.rows.find((row) => row.productId === ids.productA);
    if (!tomatoes) throw new Error("Tomatoes row missing");
    // Target is 4 × 2 = 8; 2 on hand + 2 on the sent order leaves 4.
    expect(tomatoes.targetSource).toBe("fallback");
    expect(Number(tomatoes.target)).toBe(8);
    expect(Number(tomatoes.onOrder)).toBe(2);
    expect(Number(tomatoes.suggested)).toBe(4);

    const cucumber = produce.rows.find((row) => row.productId === ids.productB);
    if (!cucumber) throw new Error("Cucumber row missing");
    // A stored target wins over the doubled reorder level.
    expect(cucumber.targetSource).toBe("set");
    expect(Number(cucumber.target)).toBe(3);
    expect(Number(cucumber.suggested)).toBe(3);

    const dairy = page.groups.find(
      (group) => group.supplierId === ids.supplierB,
    );
    if (!dairy) throw new Error("Dairy group missing");
    expect(dairy.openOrder).toMatchObject({
      orderNumber: "PO-R-0002",
      status: "draft",
    });
    const milk = dairy.rows.find((row) => row.productId === ids.productC);
    if (!milk) throw new Error("Milk row missing");
    // The draft's 5 bottles are not on order yet, and the row says so.
    expect(Number(milk.onOrder)).toBe(0);
    expect(Number(milk.suggested)).toBe(9);
    expect(milk.onDraft).toBe(true);
    expect(Number(milk.target)).toBe(10);
  });

  it("shows another tenant nothing", async () => {
    const page = await asUser(ids.otherOwner, (client) =>
      getReorderPage(ids.otherOwner, ids.otherBusiness, client),
    );
    expect(page.groups).toEqual([]);
    expect(page.productCount).toBe(0);
    expect(page.unassignedCount).toBe(0);
  });

  it("refuses a negative target at the database", async () => {
    const failure = await asUser(ids.owner, async (client) => {
      await client.query("savepoint negative_target");
      try {
        await client.query(
          "update products set target_stock_level = -1 where id = $1",
          [ids.productA],
        );
        return null;
      } catch (error) {
        await client.query("rollback to savepoint negative_target");
        return error as { code?: string; constraint?: string };
      }
    });

    expect(failure).toMatchObject({
      code: "23514",
      constraint: "products_target_stock_level_check",
    });
  });
});

describe("creating from a selection", () => {
  it("creates one draft and sets the date from the lead time", async () => {
    const result = await asUserCommitted(ids.owner, (client) =>
      saveReorderSelection(
        ids.owner,
        ids.business,
        {
          supplierId: ids.supplierC,
          lines: [{ productId: ids.productE, quantity: "3" }],
        },
        client,
      ),
    );

    expect(result).toMatchObject({ ok: true, created: true });

    const stored = await pool.query<{
      status: string;
      expected_delivery_at: string | null;
      quantity: string;
    }>(
      `select po.status, po.expected_delivery_at::text,
              l.quantity_ordered::text as quantity
         from purchase_orders po
         join purchase_order_lines l
           on l.business_id = po.business_id and l.purchase_order_id = po.id
        where po.business_id = $1 and po.supplier_id = $2`,
      [ids.business, ids.supplierC],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]?.status).toBe("draft");
    expect(Number(stored.rows[0]?.quantity)).toBe(3);
    // The supplier's one-day lead time, worked out by the same helper the order
    // form uses; the helper's own date arithmetic is unit-tested separately.
    expect(stored.rows[0]?.expected_delivery_at).toBe(suggestedDeliveryDate(1));
  });

  it("adds lines to the supplier's existing draft instead of opening a second", async () => {
    const result = await asUserCommitted(ids.owner, (client) =>
      saveReorderSelection(
        ids.owner,
        ids.business,
        {
          supplierId: ids.supplierB,
          lines: [{ productId: ids.productD, quantity: "4" }],
        },
        client,
      ),
    );

    expect(result).toMatchObject({
      ok: true,
      created: false,
      orderId: ids.draftOrder,
    });

    const orders = await pool.query<{ total: number }>(
      `select count(*)::int as total
         from purchase_orders
        where business_id = $1 and supplier_id = $2
          and status in ('draft', 'ordered', 'partially_received')`,
      [ids.business, ids.supplierB],
    );
    expect(orders.rows[0]?.total).toBe(1);

    const lines = await pool.query<{
      product_id: string;
      quantity_ordered: string;
    }>(
      `select product_id, quantity_ordered::text
         from purchase_order_lines
        where business_id = $1 and purchase_order_id = $2
        order by product_id`,
      [ids.business, ids.draftOrder],
    );
    expect(lines.rows).toHaveLength(2);
    expect(
      lines.rows.find((line) => line.product_id === ids.productD)
        ?.quantity_ordered,
    ).toBe("4.000");
    expect(
      lines.rows.find((line) => line.product_id === ids.productC)
        ?.quantity_ordered,
    ).toBe("5.000");
  });

  it("refuses a product already on the draft", async () => {
    const result = await asUser(ids.owner, (client) =>
      saveReorderSelection(
        ids.owner,
        ids.business,
        {
          supplierId: ids.supplierB,
          lines: [{ productId: ids.productC, quantity: "2" }],
        },
        client,
      ),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");
    expect(result.error).toContain("already on PO-R-0002");
  });

  it("refuses a supplier whose open order has been sent", async () => {
    const result = await asUser(ids.owner, (client) =>
      saveReorderSelection(
        ids.owner,
        ids.business,
        {
          supplierId: ids.supplierA,
          lines: [{ productId: ids.productA, quantity: "1" }],
        },
        client,
      ),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");
    expect(result.error).toContain("already with Reorder Produce");
  });

  it("refuses a viewer, a foreign supplier and a product from another supplier", async () => {
    const viewer = await asUser(ids.viewer, (client) =>
      saveReorderSelection(
        ids.viewer,
        ids.business,
        {
          supplierId: ids.supplierD,
          lines: [{ productId: ids.productF, quantity: "1" }],
        },
        client,
      ),
    );
    expect(viewer.ok).toBe(false);
    if (viewer.ok) throw new Error("expected a refusal");
    expect(viewer.error).toContain("permission");

    const foreign = await asUser(ids.otherOwner, (client) =>
      saveReorderSelection(
        ids.otherOwner,
        ids.otherBusiness,
        {
          supplierId: ids.supplierC,
          lines: [{ productId: ids.productE, quantity: "1" }],
        },
        client,
      ),
    );
    expect(foreign.ok).toBe(false);

    const wrongProduct = await asUser(ids.owner, (client) =>
      saveReorderSelection(
        ids.owner,
        ids.business,
        {
          supplierId: ids.supplierD,
          lines: [{ productId: ids.productA, quantity: "1" }],
        },
        client,
      ),
    );
    expect(wrongProduct.ok).toBe(false);
    if (wrongProduct.ok) throw new Error("expected a refusal");
    expect(wrongProduct.error).toContain("no longer supplied");
  });
});
