import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { databaseUrl } from "../../db/env";
import {
  addProductSupplier,
  listProductSupplierLinks,
  removeProductSupplier,
  setDefaultProductSupplier,
} from "../../src/lib/products";
import { listSuppliers as listSupplierSummaries } from "../../src/lib/suppliers";
import {
  createPurchaseOrder,
  getOrderFormOptions,
  updateDraftPurchaseOrder,
} from "../../src/lib/purchase-orders";
import { getReorderPage, saveReorderSelection } from "../../src/lib/reorder";
import { suggestedDeliveryDate } from "../../src/lib/purchase-order-input";

/**
 * Slice F: a product's suppliers are link rows, not a product column. These tests
 * pin the invariants the rest of the app now relies on: one default, a code unique
 * within a supplier, alternates surviving a default change, reorder suggestions
 * appearing under every linked supplier, and orders refusing an unlinked product.
 */
const pool = new Pool({ connectionString: databaseUrl(), max: 4 });

const ids = {
  business: randomUUID(),
  owner: randomUUID(),
  viewer: randomUUID(),
  supplierA: randomUUID(),
  supplierB: randomUUID(),
  productA: randomUUID(),
  productB: randomUUID(),
  productC: randomUUID(),
  productNoLink: randomUUID(),
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

async function countProductsWithoutDefault(): Promise<number> {
  const result = await pool.query<{ total: number }>(
    `select count(*)::int as total
       from products p
      where p.business_id = $1 and p.is_archived = false
        and not exists (
          select 1 from product_suppliers ps
           where ps.business_id = p.business_id and ps.product_id = p.id
             and ps.is_default
        )`,
    [ids.business],
  );
  return result.rows[0]?.total ?? 0;
}

beforeAll(async () => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into businesses (id, name, business_type)
       values ($1, 'Links Cafe', 'cafe')`,
      [ids.business],
    );
    await client.query(
      `insert into auth.users (id, email) values ($1, $2), ($3, $4)`,
      [
        ids.owner,
        `links-owner-${ids.business}@test.invalid`,
        ids.viewer,
        `links-viewer-${ids.business}@test.invalid`,
      ],
    );
    await client.query(
      `insert into business_members (business_id, user_id, role)
       values ($1, $2, 'owner'), ($1, $3, 'viewer')`,
      [ids.business, ids.owner, ids.viewer],
    );
    await client.query(
      `insert into suppliers (id, business_id, name, lead_time_days) values
         ($1, $2, 'Link Produce', 2), ($3, $2, 'Link Dairy', 5)`,
      [ids.supplierA, ids.business, ids.supplierB],
    );
    await client.query(
      `insert into products
         (id, business_id, name, sku, unit_of_measure, cost_price, reorder_level,
          target_stock_level)
       values
         ($1, $2, 'Link Tomatoes', 'LNK-1', 'kg', 4.20, 4, 8),
         ($3, $2, 'Link Apples', 'LNK-2', 'kg', 2.50, 1, null),
         ($4, $2, 'Link Milk', 'LNK-3', 'bottle', 3.10, 2, 4),
         ($5, $2, 'Link Unlinked', 'LNK-4', 'ea', 1.00, 2, 4)`,
      [
        ids.productA,
        ids.business,
        ids.productB,
        ids.productC,
        ids.productNoLink,
      ],
    );
    await client.query(
      `insert into product_suppliers
         (business_id, product_id, supplier_id, supplier_sku, lead_time_days,
          is_default)
       values
         ($1, $2, $3, 'A-1', null, true),
         ($1, $2, $4, 'B-100', 10, false),
         ($1, $5, $3, 'A-2', null, true),
         ($1, $6, $4, 'B-200', null, true)`,
      [
        ids.business,
        ids.productA,
        ids.supplierA,
        ids.supplierB,
        ids.productB,
        ids.productC,
      ],
    );
    await client.query(
      `insert into stock_movements
         (business_id, product_id, movement_type, quantity_delta, reason)
       values ($1, $2, 'opening', 100, 'Opening balance')`,
      [ids.business, ids.productB],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
});

afterAll(async () => {
  await pool.query("delete from businesses where id = $1", [ids.business]);
  await pool.query("delete from auth.users where id = any($1::uuid[])", [
    [ids.owner, ids.viewer],
  ]);
  await pool.end();
});

describe("supplier links", () => {
  it("counts an active product with no default, then repairs it", async () => {
    expect(await countProductsWithoutDefault()).toBe(1);

    const added = await addProductSupplier(
      ids.owner,
      ids.business,
      ids.productNoLink,
      {
        supplierId: ids.supplierA,
        supplierSku: "P4",
        leadTimeDays: null,
      },
    );
    expect(added.ok).toBe(true);

    const links = await listProductSupplierLinks(
      ids.owner,
      ids.business,
      ids.productNoLink,
    );
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ isDefault: false, supplierSku: "P4" });

    const promoted = await setDefaultProductSupplier(
      ids.owner,
      ids.business,
      ids.productNoLink,
      links[0].id,
    );
    expect(promoted.ok).toBe(true);
    expect(await countProductsWithoutDefault()).toBe(0);
  });

  it("lists every link and counts alternate suppliers once", async () => {
    const links = await listProductSupplierLinks(
      ids.owner,
      ids.business,
      ids.productA,
    );
    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({
      supplierName: "Link Produce",
      isDefault: true,
    });
    expect(links[1]).toMatchObject({
      supplierName: "Link Dairy",
      isDefault: false,
      leadTimeDays: 10,
      effectiveLeadTimeDays: 10,
    });

    const suppliers = await listSupplierSummaries(ids.owner, ids.business);
    expect(
      suppliers.find((supplier) => supplier.id === ids.supplierA)?.productCount,
    ).toBe(3);
    expect(
      suppliers.find((supplier) => supplier.id === ids.supplierB)?.productCount,
    ).toBe(2);
  });

  it("moves the default, keeps the old supplier, and refuses to remove the default", async () => {
    const added = await addProductSupplier(
      ids.owner,
      ids.business,
      ids.productB,
      {
        supplierId: ids.supplierB,
        supplierSku: "ALT-2",
        leadTimeDays: 7,
      },
    );
    expect(added.ok).toBe(true);

    let links = await listProductSupplierLinks(
      ids.owner,
      ids.business,
      ids.productB,
    );
    expect(links.map((link) => link.isDefault)).toEqual([true, false]);

    const alternate = links.find((link) => !link.isDefault);
    if (!alternate) throw new Error("alternate link missing");
    const promoted = await setDefaultProductSupplier(
      ids.owner,
      ids.business,
      ids.productB,
      alternate.id,
    );
    expect(promoted.ok).toBe(true);

    links = await listProductSupplierLinks(
      ids.owner,
      ids.business,
      ids.productB,
    );
    expect(
      links.find((link) => link.supplierId === ids.supplierB),
    ).toMatchObject({
      isDefault: true,
      effectiveLeadTimeDays: 7,
    });

    const oldDefault = links.find((link) => link.supplierId === ids.supplierA);
    if (!oldDefault) throw new Error("old default missing");
    const removed = await removeProductSupplier(
      ids.owner,
      ids.business,
      ids.productB,
      oldDefault.id,
    );
    expect(removed.ok).toBe(true);

    const newDefault = links.find((link) => link.supplierId === ids.supplierB);
    if (!newDefault) throw new Error("new default missing");
    const refused = await removeProductSupplier(
      ids.owner,
      ids.business,
      ids.productB,
      newDefault.id,
    );
    expect(refused).toEqual({
      ok: false,
      error: "Choose another default supplier before removing this one.",
    });
  });

  it("keeps a supplier code unique within that supplier", async () => {
    const result = await asUser(ids.owner, async (client) => {
      const link = await client.query<{ id: string }>(
        `select id from product_suppliers
          where business_id = $1 and product_id = $2 and supplier_id = $3`,
        [ids.business, ids.productC, ids.supplierB],
      );
      return captureError(client, () =>
        client.query(
          `update product_suppliers set supplier_sku = 'B-100' where id = $1`,
          [link.rows[0].id],
        ),
      );
    });

    expect(result).toMatchObject({
      code: "23505",
      constraint: "product_suppliers_code_key",
    });
  });
});

describe("linked suppliers across the app", () => {
  it("offers each linked supplier in the order form and refuses the others", async () => {
    const options = await getOrderFormOptions(ids.owner, ids.business);
    const tomatoes = options.products.find(
      (product) => product.id === ids.productA,
    );
    const milk = options.products.find(
      (product) => product.id === ids.productC,
    );
    expect(tomatoes?.supplierIds).toEqual(
      expect.arrayContaining([ids.supplierA, ids.supplierB]),
    );
    expect(milk?.supplierIds).toEqual([ids.supplierB]);

    const wrong = await createPurchaseOrder(ids.owner, ids.business, {
      supplierId: ids.supplierA,
      expectedDeliveryAt: null,
      notes: null,
      lines: [{ productId: ids.productC, quantity: "2", unitCost: "3.10" }],
    });
    expect(wrong.ok).toBe(false);
    if (wrong.ok) throw new Error("expected a refusal");
    expect(wrong.error).toContain("not supplied by the chosen supplier");

    const created = await createPurchaseOrder(ids.owner, ids.business, {
      supplierId: ids.supplierB,
      expectedDeliveryAt: null,
      notes: "Link order",
      lines: [{ productId: ids.productC, quantity: "2", unitCost: "3.10" }],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("expected an order");

    const update = await updateDraftPurchaseOrder(
      ids.owner,
      ids.business,
      created.id,
      {
        supplierId: ids.supplierB,
        expectedDeliveryAt: null,
        notes: "Link order",
        lines: [
          { productId: ids.productC, quantity: "2", unitCost: "3.10" },
          { productId: ids.productNoLink, quantity: "1", unitCost: "1.00" },
        ],
      },
    );
    expect(update.ok).toBe(false);
    if (update.ok) throw new Error("expected a refusal");
    expect(update.error).toContain("not supplied by the chosen supplier");
  });

  it("suggests a product under every supplier it is linked to", async () => {
    const page = await getReorderPage(ids.owner, ids.business);
    expect(page.supplierCount).toBe(2);
    expect(page.unassignedCount).toBe(0);

    const produce = page.groups.find(
      (group) => group.supplierId === ids.supplierA,
    );
    const dairy = page.groups.find(
      (group) => group.supplierId === ids.supplierB,
    );
    if (!produce || !dairy) throw new Error("reorder groups missing");

    expect(produce.rows.some((row) => row.productId === ids.productA)).toBe(
      true,
    );
    expect(dairy.rows.some((row) => row.productId === ids.productA)).toBe(true);
    // The dairy card uses the longest effective lead time in its group.
    expect(dairy.leadTimeDays).toBe(10);

    const result = await saveReorderSelection(ids.owner, ids.business, {
      supplierId: ids.supplierA,
      lines: [{ productId: ids.productA, quantity: "4" }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected an order");

    const stored = await pool.query<{ expected: string; supplier: string }>(
      `select po.expected_delivery_at::text as expected, po.supplier_id::text as supplier
         from purchase_orders po where po.id = $1`,
      [result.orderId],
    );
    expect(stored.rows[0]?.supplier).toBe(ids.supplierA);
    expect(stored.rows[0]?.expected).toBe(suggestedDeliveryDate(2));
  });
});
