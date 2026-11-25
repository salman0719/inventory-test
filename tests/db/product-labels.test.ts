import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { databaseUrl } from "../../db/env";
import { getProductLabels } from "../../src/lib/product-labels";

/**
 * Slice G: the label sheet is a filtered catalogue read. It must include the
 * default supplier's code, find a manufacturer barcode through search, hide
 * archived products unless asked, and never cross a tenant boundary.
 */
const pool = new Pool({ connectionString: databaseUrl(), max: 4 });

const ids = {
  business: randomUUID(),
  owner: randomUUID(),
  stranger: randomUUID(),
  supplier: randomUUID(),
  active: randomUUID(),
  archived: randomUUID(),
};

beforeAll(async () => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into businesses (id, name, business_type)
       values ($1, 'Label Cafe', 'cafe')`,
      [ids.business],
    );
    await client.query(
      `insert into auth.users (id, email) values ($1, $2), ($3, $4)`,
      [
        ids.owner,
        `label-owner-${ids.business}@test.invalid`,
        ids.stranger,
        `label-stranger-${ids.business}@test.invalid`,
      ],
    );
    await client.query(
      `insert into business_members (business_id, user_id, role)
       values ($1, $2, 'owner')`,
      [ids.business, ids.owner],
    );
    await client.query(
      `insert into suppliers (id, business_id, name) values ($1, $2, 'Label Supplier')`,
      [ids.supplier, ids.business],
    );
    await client.query(
      `insert into products
         (id, business_id, name, sku, barcode, unit_of_measure, is_archived)
       values
         ($1, $2, 'Label Tomatoes', 'LBL-1', '9300675024235', 'kg', false),
         ($3, $2, 'Label Old Apples', 'LBL-2', 'ARCHIVE-1', 'kg', true)`,
      [ids.active, ids.business, ids.archived],
    );
    await client.query(
      `insert into product_suppliers
         (business_id, product_id, supplier_id, supplier_sku, is_default)
       values ($1, $2, $3, 'SUP-TOMATO', true)`,
      [ids.business, ids.active, ids.supplier],
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
    [ids.owner, ids.stranger],
  ]);
  await pool.end();
});

describe("product label data", () => {
  it("reads one product with its default supplier code", async () => {
    const result = await getProductLabels(ids.owner, ids.business, {
      productId: ids.active,
    });
    expect(result.total).toBe(1);
    expect(result.labels[0]).toMatchObject({
      name: "Label Tomatoes",
      sku: "LBL-1",
      barcode: "9300675024235",
      supplierSku: "SUP-TOMATO",
    });
  });

  it("finds a barcode through search and hides archived products by default", async () => {
    const byBarcode = await getProductLabels(ids.owner, ids.business, {
      search: "9300675024235",
    });
    expect(byBarcode.labels.map((label) => label.sku)).toEqual(["LBL-1"]);

    const active = await getProductLabels(ids.owner, ids.business, {});
    expect(active.labels.map((label) => label.sku)).toEqual(["LBL-1"]);

    const all = await getProductLabels(ids.owner, ids.business, {
      includeArchived: true,
    });
    expect(all.total).toBe(2);
  });

  it("returns nothing to a signed-in user with no membership", async () => {
    const result = await getProductLabels(ids.stranger, ids.business, {});
    expect(result).toEqual({ labels: [], total: 0 });
  });
});
