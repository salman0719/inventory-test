import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { databaseUrl } from "../../db/env";

/**
 * Supplier import against real Postgres as `authenticated`.
 *
 * The function is the authority: a name is the key, a duplicate inside the file is
 * refused, an archived supplier is not resurrected, and an update fills in the
 * fields the file carries without clearing the ones it leaves blank.
 */
const pool = new Pool({ connectionString: databaseUrl(), max: 4 });
const suffix = randomUUID().slice(0, 8);

const ids = {
  business: randomUUID(),
  otherBusiness: randomUUID(),
  owner: randomUUID(),
  viewer: randomUUID(),
  otherOwner: randomUUID(),
  existing: randomUUID(),
  archived: randomUUID(),
};

type SupplierImportRow = {
  rowNumber: number;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  leadTimeDays: number | null;
  notes: string | null;
};

type Overrides = {
  updateExisting?: boolean;
  totalRows?: number;
  key?: string;
  filename?: string;
};

function row(
  name: string,
  index: number,
  overrides: Partial<SupplierImportRow> = {},
): SupplierImportRow {
  return {
    rowNumber: index + 2,
    name,
    contactName: null,
    email: null,
    phone: null,
    address: null,
    leadTimeDays: null,
    notes: null,
    ...overrides,
  };
}

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

async function callImport(
  userId: string,
  businessId: string,
  rows: SupplierImportRow[],
  overrides: Overrides = {},
): Promise<{
  import_id: string;
  imported: number;
  updated: number;
  skipped: number;
}> {
  const key = overrides.key ?? randomUUID();
  return asUser(userId, async (client) => {
    const result = await client.query<{
      import_id: string;
      imported: number;
      updated: number;
      skipped: number;
    }>(
      `select import_id, imported, updated, skipped
         from private.import_suppliers($1, $2::jsonb, $3, $4, $5, $6)`,
      [
        businessId,
        JSON.stringify(rows),
        overrides.updateExisting ?? false,
        key,
        overrides.filename ?? "suppliers-nov.csv",
        overrides.totalRows ?? rows.length,
      ],
    );
    const first = result.rows[0];
    if (!first) throw new Error("no import result returned");
    return first;
  });
}

async function expectRefusal(
  userId: string,
  businessId: string,
  rows: SupplierImportRow[],
  overrides: Overrides = {},
): Promise<{ code?: string; message: string }> {
  try {
    await callImport(userId, businessId, rows, overrides);
  } catch (error) {
    const failure = error as { code?: string; message?: string };
    return { code: failure.code, message: failure.message ?? "" };
  }
  throw new Error("expected the database to refuse that import");
}

async function supplierByName(name: string) {
  const result = await pool.query<{
    id: string;
    name: string;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    notes: string | null;
    lead_time_days: number | null;
    is_archived: boolean;
  }>(
    `select id, name, contact_name, email, phone, address, notes,
            lead_time_days, is_archived
       from suppliers
      where business_id = $1 and lower(name) = lower($2)`,
    [ids.business, name],
  );
  return result.rows[0];
}

beforeAll(async () => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into businesses (id, name, business_type) values
         ($1, 'Supplier Import Cafe', 'cafe'),
         ($2, 'Supplier Import Other', 'retail')`,
      [ids.business, ids.otherBusiness],
    );
    await client.query(
      `insert into auth.users (id, email) values
         ($1, $2), ($3, $4), ($5, $6)`,
      [
        ids.owner,
        `supplier-owner-${suffix}@test.invalid`,
        ids.viewer,
        `supplier-viewer-${suffix}@test.invalid`,
        ids.otherOwner,
        `supplier-other-${suffix}@test.invalid`,
      ],
    );
    await client.query(
      `insert into business_members (business_id, user_id, role) values
         ($1, $2, 'owner'), ($1, $3, 'viewer'), ($4, $5, 'owner')`,
      [ids.business, ids.owner, ids.viewer, ids.otherBusiness, ids.otherOwner],
    );
    await client.query(
      `insert into suppliers (id, business_id, name, phone, is_archived) values
         ($1, $2, 'Polar Line Frozen', '02 5550 0000', false),
         ($3, $2, 'Old Supplier', null, true)`,
      [ids.existing, ids.business, ids.archived],
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
    [ids.owner, ids.viewer, ids.otherOwner],
  ]);
  await pool.end();
});

describe("private.import_suppliers", () => {
  it("creates suppliers with their details and records one history row", async () => {
    const result = await callImport(ids.owner, ids.business, [
      row("Paper Co", 0, {
        contactName: "Sam Reid",
        email: "orders@paper.example",
        phone: "02 5550 9911",
        address: "3 Pack St, Sydney NSW",
        leadTimeDays: 2,
        notes: "Delivers Tue",
      }),
      row("Roast Lab", 1),
    ]);

    expect(result.imported).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);

    const created = await supplierByName("Paper Co");
    expect(created?.contact_name).toBe("Sam Reid");
    expect(created?.email).toBe("orders@paper.example");
    expect(created?.lead_time_days).toBe(2);
    expect(created?.is_archived).toBe(false);

    const history = await pool.query<{ kind: string; imported_rows: number }>(
      `select kind, imported_rows from csv_imports where id = $1`,
      [result.import_id],
    );
    expect(history.rows[0]).toEqual({ kind: "suppliers", imported_rows: 2 });

    const events = await pool.query<{ n: number }>(
      `select count(*)::int as n from activity_log
        where entity_id = $1 and action = 'import.completed'`,
      [result.import_id],
    );
    expect(events.rows[0]?.n).toBe(1);
  });

  it("returns the first result on replay and writes nothing", async () => {
    const key = randomUUID();
    const rows = [row("Replay Supplies", 0)];
    const first = await callImport(ids.owner, ids.business, rows, { key });
    const replay = await callImport(ids.owner, ids.business, rows, { key });

    expect(replay).toEqual(first);
    const count = await pool.query<{ n: number }>(
      `select count(*)::int as n from suppliers
        where business_id = $1 and lower(name) = 'replay supplies'`,
      [ids.business],
    );
    expect(count.rows[0]?.n).toBe(1);
  });

  it("refuses an existing name unless updating", async () => {
    const refusal = await expectRefusal(ids.owner, ids.business, [
      row("polar line frozen", 0, { email: "new@polar.example" }),
    ]);
    expect(refusal.code).toBe("22023");
    expect(refusal.message).toContain("already a supplier");
    expect((await supplierByName("Polar Line Frozen"))?.email).toBeNull();
  });

  it("fills provided fields and leaves blank ones alone", async () => {
    const result = await callImport(
      ids.owner,
      ids.business,
      [row("Polar Line Frozen", 0, { email: "orders@polar.example" })],
      { updateExisting: true },
    );

    expect(result.imported).toBe(0);
    expect(result.updated).toBe(1);
    const updated = await supplierByName("Polar Line Frozen");
    expect(updated?.email).toBe("orders@polar.example");
    expect(updated?.phone).toBe("02 5550 0000");
    expect(updated?.name).toBe("Polar Line Frozen");
  });

  it("refuses a name repeated inside the file", async () => {
    const refusal = await expectRefusal(ids.owner, ids.business, [
      row("Twin Supplies", 0),
      row("twin supplies", 1),
    ]);
    expect(refusal.code).toBe("22023");
    expect(refusal.message).toContain("more than once");
    expect(await supplierByName("Twin Supplies")).toBeUndefined();
  });

  it("refuses an archived supplier rather than resurrecting it", async () => {
    const refusal = await expectRefusal(
      ids.owner,
      ids.business,
      [row("Old Supplier", 0)],
      { updateExisting: true },
    );
    expect(refusal.code).toBe("22023");
    expect(refusal.message).toContain("archived");
    expect((await supplierByName("Old Supplier"))?.is_archived).toBe(true);
  });

  it("refuses a bad email, a bad lead time and 501 rows", async () => {
    const email = await expectRefusal(ids.owner, ids.business, [
      row("Bad Email Co", 0, { email: "orders(at)bad.example" }),
    ]);
    expect(email.code).toBe("22023");

    const lead = await expectRefusal(ids.owner, ids.business, [
      row("Bad Lead Co", 0, { leadTimeDays: 400 }),
    ]);
    expect(lead.code).toBe("22023");

    const many = Array.from({ length: 501 }, (_, index) =>
      row(`Bulk Supplier ${index}`, index),
    );
    expect((await expectRefusal(ids.owner, ids.business, many)).code).toBe(
      "22023",
    );
  });

  it("counts skipped rows from the file total", async () => {
    const result = await callImport(
      ids.owner,
      ids.business,
      [row("Partial Supplies", 0)],
      { totalRows: 3 },
    );
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(2);
  });

  it("refuses a viewer and a foreign business", async () => {
    expect(
      (await expectRefusal(ids.viewer, ids.business, [row("Viewer Co", 0)]))
        .code,
    ).toBe("42501");
    expect(
      (
        await expectRefusal(ids.otherOwner, ids.business, [
          row("Foreign Co", 0),
        ])
      ).code,
    ).toBe("P0002");
  });
});
