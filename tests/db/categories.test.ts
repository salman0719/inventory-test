import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { databaseUrl } from "../../db/env";
import {
  deleteCategory,
  listCategories,
  renameCategory,
} from "../../src/lib/products";

/**
 * Categories leave Settings for their own Products page: rename an existing
 * row, refuse a duplicate name, delete an empty one, and refuse one still on
 * a product. All through RLS as `authenticated`, never as the table owner.
 */
const pool = new Pool({ connectionString: databaseUrl(), max: 4 });

const ids = {
  business: randomUUID(),
  otherBusiness: randomUUID(),
  owner: randomUUID(),
  staff: randomUUID(),
  viewer: randomUUID(),
  otherOwner: randomUUID(),
  supplier: randomUUID(),
  usedCategory: randomUUID(),
  emptyCategory: randomUUID(),
  otherCategory: randomUUID(),
  product: randomUUID(),
};

beforeAll(async () => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into businesses (id, name, business_type)
       values ($1, 'Category Cafe', 'cafe'), ($2, 'Category Shop', 'retail')`,
      [ids.business, ids.otherBusiness],
    );
    await client.query(
      `insert into auth.users (id, email) values ($1, $2), ($3, $4), ($5, $6), ($7, $8)`,
      [
        ids.owner,
        `cat-owner-${ids.business}@test.invalid`,
        ids.staff,
        `cat-staff-${ids.business}@test.invalid`,
        ids.viewer,
        `cat-viewer-${ids.business}@test.invalid`,
        ids.otherOwner,
        `cat-owner-${ids.otherBusiness}@test.invalid`,
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
         ($1, $2, 'Produce'), ($3, $2, 'Empty'), ($4, $5, 'Other Produce')`,
      [
        ids.usedCategory,
        ids.business,
        ids.emptyCategory,
        ids.otherCategory,
        ids.otherBusiness,
      ],
    );
    await client.query(
      `insert into suppliers (id, business_id, name) values ($1, $2, 'Cat Supplier')`,
      [ids.supplier, ids.business],
    );
    await client.query(
      `insert into products (id, business_id, category_id, name, sku)
       values ($1, $2, $3, 'Cat Tomatoes', 'CAT-1')`,
      [ids.product, ids.business, ids.usedCategory],
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
    [ids.owner, ids.staff, ids.viewer, ids.otherOwner],
  ]);
  await pool.end();
});

describe("category rename and delete", () => {
  it("renames a category and lists it with its product count", async () => {
    const renamed = await renameCategory(
      ids.owner,
      ids.business,
      ids.usedCategory,
      "Fresh Produce",
    );
    expect(renamed).toBe(true);

    const categories = await listCategories(ids.owner, ids.business);
    expect(
      categories.find((category) => category.id === ids.usedCategory),
    ).toMatchObject({ name: "Fresh Produce", productCount: 1 });
  });

  it("refuses a duplicate name in the same business", async () => {
    await expect(
      renameCategory(
        ids.owner,
        ids.business,
        ids.emptyCategory,
        "fresh produce",
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("refuses a foreign category", async () => {
    const renamed = await renameCategory(
      ids.owner,
      ids.business,
      ids.otherCategory,
      "Nope",
    );
    expect(renamed).toBe(false);
  });

  it("deletes an empty category and refuses one still on a product", async () => {
    const deleted = await deleteCategory(
      ids.staff,
      ids.business,
      ids.emptyCategory,
    );
    expect(deleted).toEqual({ ok: true });

    const inUse = await deleteCategory(
      ids.owner,
      ids.business,
      ids.usedCategory,
    );
    expect(inUse).toEqual({ ok: false, reason: "in-use" });

    const missing = await deleteCategory(
      ids.owner,
      ids.business,
      ids.otherCategory,
    );
    expect(missing).toEqual({ ok: false, reason: "not-found" });
  });

  it("refuses a viewer write and another tenant's rows", async () => {
    // RLS hides the row from a viewer write, so the lib reports not-found
    // rather than a permission fault; the page also hides the controls.
    await expect(
      renameCategory(ids.viewer, ids.business, ids.usedCategory, "Viewer"),
    ).resolves.toBe(false);
    await expect(
      deleteCategory(ids.viewer, ids.business, ids.usedCategory),
    ).resolves.toEqual({ ok: false, reason: "not-found" });

    const categories = await listCategories(ids.otherOwner, ids.otherBusiness);
    expect(
      categories.some((category) => category.id === ids.usedCategory),
    ).toBe(false);
  });
});
