import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { databaseUrl } from "../../db/env";
import { resolveScan } from "../../src/lib/scan";

/**
 * Slice G: a scan is resolved inside the active business only. A barcode can
 * match several products, so the resolver returns a chooser rather than picking
 * one; a QR product id is just another lookup with the same RLS boundary.
 */
const pool = new Pool({ connectionString: databaseUrl(), max: 4 });

const ids = {
  businessA: randomUUID(),
  businessB: randomUUID(),
  ownerA: randomUUID(),
  ownerB: randomUUID(),
  case: randomUUID(),
  unit: randomUUID(),
  skuOnly: randomUUID(),
  foreign: randomUUID(),
};

beforeAll(async () => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into businesses (id, name, business_type)
       values ($1, 'Scan Cafe', 'cafe'), ($2, 'Other Cafe', 'cafe')`,
      [ids.businessA, ids.businessB],
    );
    await client.query(
      `insert into auth.users (id, email) values ($1, $2), ($3, $4)`,
      [
        ids.ownerA,
        `scan-a-${ids.businessA}@test.invalid`,
        ids.ownerB,
        `scan-b-${ids.businessB}@test.invalid`,
      ],
    );
    await client.query(
      `insert into business_members (business_id, user_id, role)
       values ($1, $2, 'owner'), ($3, $4, 'owner')`,
      [ids.businessA, ids.ownerA, ids.businessB, ids.ownerB],
    );
    await client.query(
      `insert into products
         (id, business_id, name, sku, barcode, unit_of_measure, is_archived)
       values
         ($1, $2, 'Scan Case', 'SCAN-CASE', 'SHARED-CODE', 'case', false),
         ($3, $2, 'Scan Unit', 'SCAN-UNIT', 'SHARED-CODE', 'each', false),
         ($4, $2, 'Scan SKU Only', 'SKU-ONLY-9', null, 'each', false),
         ($5, $6, 'Foreign Product', 'FOREIGN-1', 'SHARED-CODE', 'each', false)`,
      [
        ids.case,
        ids.businessA,
        ids.unit,
        ids.skuOnly,
        ids.foreign,
        ids.businessB,
      ],
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
  await pool.query("delete from businesses where id = any($1::uuid[])", [
    [ids.businessA, ids.businessB],
  ]);
  await pool.query("delete from auth.users where id = any($1::uuid[])", [
    [ids.ownerA, ids.ownerB],
  ]);
  await pool.end();
});

describe("scan resolution", () => {
  it("returns a chooser when a barcode matches several products", async () => {
    const result = await resolveScan(ids.ownerA, ids.businessA, "SHARED-CODE");
    expect(result.kind).toBe("many");
    if (result.kind === "many") {
      expect(result.products.map((product) => product.sku).sort()).toEqual([
        "SCAN-CASE",
        "SCAN-UNIT",
      ]);
    }
  });

  it("matches a typed SKU case-insensitively", async () => {
    const result = await resolveScan(ids.ownerA, ids.businessA, "sku-only-9");
    expect(result.kind).toBe("one");
    if (result.kind === "one") {
      expect(result.product).toMatchObject({
        id: ids.skuOnly,
        name: "Scan SKU Only",
      });
    }
  });

  it("opens the product encoded in a QR label URL", async () => {
    const result = await resolveScan(
      ids.ownerA,
      ids.businessA,
      `https://inventory.example/scan/${ids.unit}`,
    );
    expect(result.kind).toBe("one");
    if (result.kind === "one") expect(result.product.id).toBe(ids.unit);
  });

  it("does not cross a business boundary", async () => {
    const a = await resolveScan(ids.ownerA, ids.businessA, "SHARED-CODE");
    if (a.kind === "many") {
      expect(a.products.map((product) => product.id)).not.toContain(
        ids.foreign,
      );
    }

    const foreignId = await resolveScan(ids.ownerA, ids.businessA, ids.foreign);
    expect(foreignId.kind).toBe("none");

    const b = await resolveScan(ids.ownerB, ids.businessB, "SHARED-CODE");
    expect(b.kind).toBe("one");
    if (b.kind === "one") expect(b.product.id).toBe(ids.foreign);
  });

  it("reports an unknown code without leaking an existence hint", async () => {
    const result = await resolveScan(
      ids.ownerA,
      ids.businessA,
      "DOES-NOT-EXIST",
    );
    expect(result).toEqual({ kind: "none", code: "DOES-NOT-EXIST" });
  });
});
