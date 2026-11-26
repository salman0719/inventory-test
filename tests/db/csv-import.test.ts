import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { databaseUrl } from "../../db/env";

/**
 * CSV import against real Postgres as `authenticated`.
 *
 * The function, not the preview, is the authority. These tests pin the things a
 * browser cannot: opening stock is written once per new product, an existing SKU
 * never has its stock changed, a replay writes nothing, categories and suppliers
 * are created only when allowed and only once, and the activity feed gets one
 * event for the run rather than one per row.
 */
const pool = new Pool({ connectionString: databaseUrl(), max: 4 });
const suffix = randomUUID().slice(0, 8);

const ids = {
  business: randomUUID(),
  otherBusiness: randomUUID(),
  owner: randomUUID(),
  staff: randomUUID(),
  viewer: randomUUID(),
  otherOwner: randomUUID(),
  category: randomUUID(),
  supplier: randomUUID(),
  otherSupplier: randomUUID(),
  existingProduct: randomUUID(),
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
  businessId: string,
  rows: ImportRow[],
  overrides: ImportOverrides = {},
): Promise<{ code?: string; message: string }> {
  try {
    await callImport(userId, businessId, rows, overrides);
  } catch (error) {
    const failure = error as { code?: string; message?: string };
    return { code: failure.code, message: failure.message ?? "" };
  }
  throw new Error("expected the database to refuse that import");
}

type ImportRow = {
  rowNumber: number;
  name: string;
  sku: string;
  barcode: string | null;
  category: string | null;
  supplier: string | null;
  supplierSku: string | null;
  unit: string | null;
  costPrice: string | null;
  sellingPrice: string | null;
  reorderLevel: string | null;
  targetStockLevel: string | null;
  opening: string;
  description: string | null;
};

type ImportOverrides = {
  updateExisting?: boolean;
  createSuppliers?: boolean;
  createCategories?: boolean;
  defaultSupplierId?: string | null;
  totalRows?: number;
  key?: string;
  filename?: string;
};

function row(
  sku: string,
  index: number,
  overrides: Partial<ImportRow> = {},
): ImportRow {
  return {
    rowNumber: index + 2,
    name: `Imported ${sku}`,
    sku,
    barcode: null,
    category: null,
    supplier: "Polar Line Frozen",
    supplierSku: null,
    unit: "ea",
    costPrice: "1.00",
    sellingPrice: null,
    reorderLevel: "0",
    targetStockLevel: null,
    opening: "0",
    description: null,
    ...overrides,
  };
}

async function callImport(
  userId: string,
  businessId: string,
  rows: ImportRow[],
  overrides: ImportOverrides = {},
): Promise<{
  import_id: string;
  imported: number;
  updated: number;
  skipped: number;
  opening_movements: number;
}> {
  const key = overrides.key ?? randomUUID();
  return asUser(userId, async (client) => {
    const result = await client.query<{
      import_id: string;
      imported: number;
      updated: number;
      skipped: number;
      opening_movements: number;
    }>(
      `select import_id, imported, updated, skipped, opening_movements
         from private.import_products($1, $2::jsonb, $3::jsonb, $4, $5, $6)`,
      [
        businessId,
        JSON.stringify(rows),
        JSON.stringify({
          updateExisting: overrides.updateExisting ?? false,
          createSuppliers: overrides.createSuppliers ?? false,
          createCategories: overrides.createCategories ?? false,
          defaultSupplierId: overrides.defaultSupplierId ?? null,
        }),
        key,
        overrides.filename ?? "test-import.csv",
        overrides.totalRows ?? rows.length,
      ],
    );
    const first = result.rows[0];
    if (!first) throw new Error("no import result returned");
    return first;
  });
}

async function productBySku(sku: string): Promise<
  | {
      id: string;
      name: string;
      cost_price: string;
      on_hand: number;
      supplier_id: string | null;
      supplier_sku: string | null;
      barcode: string | null;
      category_id: string | null;
      unit_of_measure: string;
      selling_price: string | null;
      reorder_level: string;
      target_stock_level: string | null;
      description: string | null;
    }
  | undefined
> {
  const result = await pool.query<{
    id: string;
    name: string;
    cost_price: string;
    on_hand: string;
    supplier_id: string | null;
    supplier_sku: string | null;
    barcode: string | null;
    category_id: string | null;
    unit_of_measure: string;
    selling_price: string | null;
    reorder_level: string;
    target_stock_level: string | null;
    description: string | null;
  }>(
    `select p.id, p.name, p.cost_price::text, p.barcode,
            p.category_id, p.unit_of_measure,
            p.selling_price::text as selling_price,
            p.reorder_level::text as reorder_level,
            p.target_stock_level::text as target_stock_level,
            p.description,
            coalesce((
              select sum(m.quantity_delta) from stock_movements m
               where m.product_id = p.id
            ), 0)::text as on_hand,
            ps.supplier_id, ps.supplier_sku
       from products p
       left join product_suppliers ps
         on ps.business_id = p.business_id and ps.product_id = p.id
        and ps.is_default
      where p.business_id = $1 and p.sku = $2`,
    [ids.business, sku],
  );
  const found = result.rows[0];
  return found ? { ...found, on_hand: Number(found.on_hand) } : undefined;
}

beforeAll(async () => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into businesses (id, name, business_type) values
         ($1, 'Import Cafe', 'cafe'),
         ($2, 'Import Other', 'retail')`,
      [ids.business, ids.otherBusiness],
    );
    await client.query(
      `insert into auth.users (id, email) values
         ($1, $2), ($3, $4), ($5, $6), ($7, $8)`,
      [
        ids.owner,
        `import-owner-${suffix}@test.invalid`,
        ids.staff,
        `import-staff-${suffix}@test.invalid`,
        ids.viewer,
        `import-viewer-${suffix}@test.invalid`,
        ids.otherOwner,
        `import-other-${suffix}@test.invalid`,
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
      `insert into categories (id, business_id, name) values
         ($1, $2, 'Coffee'),
         ($3, $4, 'Other')`,
      [ids.category, ids.business, randomUUID(), ids.otherBusiness],
    );
    await client.query(
      `insert into suppliers (id, business_id, name) values
         ($1, $2, 'Polar Line Frozen'),
         ($3, $2, 'Roast Lab'),
         ($4, $5, 'Other Supplier')`,
      [
        ids.supplier,
        ids.business,
        ids.otherSupplier,
        randomUUID(),
        ids.otherBusiness,
      ],
    );
    await client.query(
      `insert into products
         (id, business_id, category_id, name, sku, unit_of_measure,
          cost_price, reorder_level)
       values ($1, $2, $3, 'Existing coffee', 'CAF-001', 'ea', 5.00, 0)`,
      [ids.existingProduct, ids.business, ids.category],
    );
    await client.query(
      `insert into product_suppliers
         (business_id, product_id, supplier_id, supplier_sku, is_default)
       values ($1, $2, $3, 'OLD-CODE', true)`,
      [ids.business, ids.existingProduct, ids.supplier],
    );
    await client.query(
      `insert into stock_movements
         (business_id, product_id, movement_type, quantity_delta, reason,
          created_by)
       values ($1, $2, 'opening', 10, 'Opening balance', $3)`,
      [ids.business, ids.existingProduct, ids.owner],
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
  await pool.query(`delete from businesses where id = any($1::uuid[])`, [
    [ids.business, ids.otherBusiness],
  ]);
  await pool.query(`delete from auth.users where id = any($1::uuid[])`, [
    [ids.owner, ids.staff, ids.viewer, ids.otherOwner],
  ]);
  await pool.end();
});

describe("private.import_products", () => {
  it("creates products, default links and one opening movement each", async () => {
    const result = await callImport(ids.owner, ids.business, [
      row("CAF-100", 0, {
        category: "Coffee",
        supplierSku: "P-100",
        opening: "4",
        costPrice: "18.50",
      }),
      row("CAF-101", 1),
    ]);

    expect(result.imported).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.opening_movements).toBe(1);

    const first = await productBySku("CAF-100");
    expect(first?.on_hand).toBe(4);
    expect(first?.supplier_id).toBe(ids.supplier);
    expect(first?.supplier_sku).toBe("P-100");

    const second = await productBySku("CAF-101");
    expect(second?.on_hand).toBe(0);

    const movements = await pool.query<{
      reason: string;
      reference_id: string;
    }>(
      `select reason, reference_id
         from stock_movements
        where product_id = $1 and movement_type = 'opening'`,
      [first?.id],
    );
    expect(movements.rows).toHaveLength(1);
    expect(movements.rows[0]?.reason).toContain("test-import.csv");
    expect(movements.rows[0]?.reference_id).toBe(result.import_id);

    const history = await pool.query<{ imported_rows: number }>(
      `select imported_rows from csv_imports where id = $1`,
      [result.import_id],
    );
    expect(history.rows[0]?.imported_rows).toBe(2);

    const events = await pool.query<{ n: number }>(
      `select count(*)::int as n from activity_log
        where entity_id = $1 and action = 'import.completed'`,
      [result.import_id],
    );
    expect(events.rows[0]?.n).toBe(1);
  });

  it("returns the first result on replay and writes nothing", async () => {
    const key = randomUUID();
    const rows = [row("CAF-110", 0)];
    const first = await callImport(ids.owner, ids.business, rows, { key });
    const before = await pool.query<{ n: number }>(
      `select count(*)::int as n from products where business_id = $1`,
      [ids.business],
    );

    const replay = await callImport(ids.owner, ids.business, rows, { key });
    const after = await pool.query<{ n: number }>(
      `select count(*)::int as n from products where business_id = $1`,
      [ids.business],
    );

    expect(replay).toEqual(first);
    expect(after.rows[0]?.n).toBe(before.rows[0]?.n);
    const imports = await pool.query<{ n: number }>(
      `select count(*)::int as n from csv_imports
        where business_id = $1 and idempotency_key = $2`,
      [ids.business, key],
    );
    expect(imports.rows[0]?.n).toBe(1);
  });

  it("updates an existing SKU without touching stock", async () => {
    const result = await callImport(
      ids.owner,
      ids.business,
      [
        row("CAF-001", 0, {
          name: "Coffee beans, refreshed",
          costPrice: "6.50",
          supplierSku: "NEW-CODE",
        }),
      ],
      { updateExisting: true },
    );

    expect(result.imported).toBe(0);
    expect(result.updated).toBe(1);
    const product = await productBySku("CAF-001");
    expect(product?.name).toBe("Coffee beans, refreshed");
    expect(product?.cost_price).toBe("6.50");
    expect(product?.on_hand).toBe(10);
    expect(product?.supplier_sku).toBe("NEW-CODE");
  });

  it("keeps every field a partial update does not carry", async () => {
    await pool.query(
      `update products
          set barcode = '9300675024235', unit_of_measure = 'kg',
              selling_price = 9.90, reorder_level = 3,
              target_stock_level = 12, description = 'Roasted weekly'
        where business_id = $1 and sku = 'CAF-001'`,
      [ids.business],
    );

    const result = await callImport(
      ids.owner,
      ids.business,
      [
        row("CAF-001", 0, {
          name: "Coffee beans, partial price list",
          barcode: null,
          category: null,
          supplierSku: null,
          unit: null,
          costPrice: null,
          sellingPrice: null,
          reorderLevel: null,
          targetStockLevel: null,
          description: null,
        }),
      ],
      { updateExisting: true },
    );

    expect(result.updated).toBe(1);
    const product = await productBySku("CAF-001");
    expect(product).toMatchObject({
      name: "Coffee beans, partial price list",
      cost_price: "6.50",
      on_hand: 10,
      supplier_id: ids.supplier,
      supplier_sku: "NEW-CODE",
      barcode: "9300675024235",
      category_id: ids.category,
      unit_of_measure: "kg",
      selling_price: "9.90",
      reorder_level: "3.000",
      target_stock_level: "12.000",
      description: "Roasted weekly",
    });
  });

  it("applies a value the file does carry", async () => {
    const result = await callImport(
      ids.owner,
      ids.business,
      [
        row("CAF-001", 0, {
          name: "Coffee beans, partial price list",
          barcode: "111",
          unit: "bag",
          costPrice: "7.25",
          sellingPrice: "12.00",
          reorderLevel: "2",
          targetStockLevel: "6",
          description: "Updated description",
        }),
      ],
      { updateExisting: true },
    );

    expect(result.updated).toBe(1);
    const product = await productBySku("CAF-001");
    expect(product).toMatchObject({
      barcode: "111",
      unit_of_measure: "bag",
      cost_price: "7.25",
      selling_price: "12.00",
      reorder_level: "2.000",
      target_stock_level: "6.000",
      description: "Updated description",
      on_hand: 10,
    });
  });

  it("gives a new product defaults when optional cells are blank", async () => {
    const result = await callImport(ids.owner, ids.business, [
      row("CAF-180", 0, {
        unit: null,
        costPrice: null,
        reorderLevel: null,
      }),
    ]);

    expect(result.imported).toBe(1);
    const product = await productBySku("CAF-180");
    expect(product).toMatchObject({
      unit_of_measure: "ea",
      cost_price: "0.00",
      reorder_level: "0.000",
      on_hand: 0,
    });
  });

  it("refuses opening stock on an existing SKU", async () => {
    const refusal = await expectRefusal(
      ids.owner,
      ids.business,
      [row("CAF-001", 0, { opening: "2" })],
      { updateExisting: true },
    );
    expect(refusal.code).toBe("22023");
    expect(refusal.message).toContain("opening stock");
    expect((await productBySku("CAF-001"))?.on_hand).toBe(10);
  });

  it("refuses duplicate SKUs in one file", async () => {
    const refusal = await expectRefusal(ids.owner, ids.business, [
      row("CAF-120", 0),
      row("CAF-120", 1),
    ]);
    expect(refusal.code).toBe("22023");
    expect(refusal.message).toContain("more than once");
    expect(await productBySku("CAF-120")).toBeUndefined();
  });

  it("creates a category once and a supplier once when allowed", async () => {
    const result = await callImport(
      ids.owner,
      ids.business,
      [
        row("CAF-130", 0, { category: "Tea", supplier: "New Vendor" }),
        row("CAF-131", 1, { category: "Tea", supplier: "New Vendor" }),
      ],
      { createCategories: true, createSuppliers: true },
    );
    expect(result.imported).toBe(2);

    const categories = await pool.query<{ n: number }>(
      `select count(*)::int as n from categories
        where business_id = $1 and lower(name) = 'tea'`,
      [ids.business],
    );
    const suppliers = await pool.query<{ n: number }>(
      `select count(*)::int as n from suppliers
        where business_id = $1 and lower(name) = 'new vendor'`,
      [ids.business],
    );
    expect(categories.rows[0]?.n).toBe(1);
    expect(suppliers.rows[0]?.n).toBe(1);
  });

  it("refuses an unknown supplier unless creation is allowed", async () => {
    const refusal = await expectRefusal(ids.owner, ids.business, [
      row("CAF-140", 0, { supplier: "Unknown Vendor" }),
    ]);
    expect(refusal.code).toBe("22023");
    expect(refusal.message).toContain("does not exist");
  });

  it("refuses an ambiguous supplier name", async () => {
    await pool.query(
      `insert into suppliers (id, business_id, name) values
         ($1, $2, 'Twin Supplier'), ($3, $2, 'Twin Supplier')`,
      [randomUUID(), ids.business, randomUUID()],
    );
    const refusal = await expectRefusal(ids.owner, ids.business, [
      row("CAF-141", 0, { supplier: "Twin Supplier" }),
    ]);
    expect(refusal.code).toBe("22023");
    expect(refusal.message).toContain("two suppliers");
  });

  it("refuses a missing supplier, a negative opening and 501 rows", async () => {
    const missing = await expectRefusal(ids.owner, ids.business, [
      row("CAF-150", 0, { supplier: null }),
    ]);
    expect(missing.code).toBe("22023");

    const negative = await expectRefusal(ids.owner, ids.business, [
      row("CAF-151", 0, { opening: "-1" }),
    ]);
    expect(negative.code).toBe("22023");

    const many = Array.from({ length: 501 }, (_, index) =>
      row(`CAP-${index}`, index),
    );
    const capped = await expectRefusal(ids.owner, ids.business, many);
    expect(capped.code).toBe("22023");
  });

  it("uses the file supplier when a row has none", async () => {
    const result = await callImport(
      ids.owner,
      ids.business,
      [row("CAF-160", 0, { supplier: null })],
      { defaultSupplierId: ids.supplier },
    );
    expect(result.imported).toBe(1);
    expect((await productBySku("CAF-160"))?.supplier_id).toBe(ids.supplier);
  });

  it("refuses a viewer, a foreign business and a foreign import read", async () => {
    const viewer = await expectRefusal(ids.viewer, ids.business, [
      row("CAF-170", 0),
    ]);
    expect(viewer.code).toBe("42501");

    const foreign = await expectRefusal(ids.otherOwner, ids.business, [
      row("CAF-171", 0),
    ]);
    expect(foreign.code).toBe("P0002");

    await callImport(ids.owner, ids.business, [row("CAF-172", 0)]);
    const seen = await asUser(ids.otherOwner, async (client) => {
      const result = await client.query<{ n: number }>(
        `select count(*)::int as n from csv_imports where business_id = $1`,
        [ids.business],
      );
      return result.rows[0]?.n;
    });
    expect(seen).toBe(0);
  });

  it("refuses a direct insert into the history table", async () => {
    const code = await asUser(ids.owner, async (client) => {
      try {
        await client.query(
          `insert into csv_imports
             (business_id, kind, filename, idempotency_key, total_rows, created_by)
           values ($1, 'products', 'x.csv', $2, 1, $3)`,
          [ids.business, randomUUID(), ids.owner],
        );
        return "";
      } catch (error) {
        return (error as { code?: string }).code ?? "";
      }
    });
    expect(code).toBe("42501");
  });
});
