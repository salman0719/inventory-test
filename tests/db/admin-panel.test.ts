import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { databaseUrl } from "../../db/env";

/**
 * The admin panel's reads, as `authenticated`: the reviewer sees the whole queue, a
 * signed-in account that is not on `platform_admins` sees nothing, and a status the
 * panel does not offer is refused rather than passed to SQL.
 *
 * The read functions are SECURITY DEFINER and bypass RLS on purpose, so this guard is
 * the only thing standing between an applicant and every other applicant's address.
 */

const pool = new Pool({ connectionString: databaseUrl(), max: 2 });

const ids = {
  admin: randomUUID(),
  reviewer: randomUUID(),
  older: randomUUID(),
  newer: randomUUID(),
  rejected: randomUUID(),
  stranger: randomUUID(),
};

const requests: Record<string, string> = {};

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

async function refusal(
  client: PoolClient,
  sql: string,
  params: unknown[],
): Promise<{ code?: string; message?: string }> {
  let caught: { code?: string; message?: string } | null = null;
  await client.query("savepoint probe");
  try {
    await client.query(sql, params);
  } catch (error) {
    caught = error as { code?: string; message?: string };
  }
  await client.query("rollback to savepoint probe");
  if (!caught) throw new Error("expected the statement to be refused");
  return caught;
}

type Row = {
  id: string;
  status: string;
  business_name: string;
  email_confirmed: boolean;
};

beforeAll(async () => {
  const users = [
    ["admin", "panel-admin"],
    ["reviewer", "panel-reviewer"],
    ["older", "panel-older"],
    ["newer", "panel-newer"],
    ["rejected", "panel-rejected"],
    ["stranger", "panel-stranger"],
  ] as const;

  for (const [key, handle] of users) {
    await pool.query("insert into auth.users (id, email) values ($1, $2)", [
      ids[key],
      `${handle}@example.invalid`,
    ]);
  }
  await pool.query("insert into platform_admins (user_id) values ($1)", [
    ids.admin,
  ]);

  const rows = [
    ["older", "Older Cafe", "older@example.invalid", "pending", "2 days"],
    ["newer", "Newer Cafe", "newer@example.invalid", "pending", "1 hour"],
    [
      "rejected",
      "Rejected Cafe",
      "rejected@example.invalid",
      "rejected",
      "3 days",
    ],
  ] as const;

  for (const [key, business, email, status, age] of rows) {
    const result = await pool.query<{ id: string }>(
      `insert into signup_requests
         (user_id, email, full_name, business_name, business_type, status,
          admin_note, decided_by, decided_at, created_at)
       values ($1, $2, 'Panel Applicant', $3, 'cafe', $4,
               $5, $6, $7, now() - $8::interval)
       returning id`,
      [
        ids[key],
        email,
        business,
        status,
        status === "rejected" ? "Not a real business." : null,
        status === "rejected" ? ids.admin : null,
        status === "rejected" ? new Date() : null,
        age,
      ],
    );
    requests[key] = result.rows[0].id;
  }
});

afterAll(async () => {
  await pool.query(
    "delete from signup_requests where user_id = any($1::uuid[])",
    [[ids.older, ids.newer, ids.rejected]],
  );
  await pool.query(
    "delete from platform_admins where user_id = any($1::uuid[])",
    [[ids.admin, ids.reviewer]],
  );
  await pool.query("delete from auth.users where id = any($1::uuid[])", [
    [ids.admin, ids.reviewer, ids.older, ids.newer, ids.rejected, ids.stranger],
  ]);
  await pool.end();
});

describe("private.list_signup_requests", () => {
  it("returns waiting rows first, oldest first, to an admin", async () => {
    const rows = await asUser(ids.admin, async (client) => {
      const result = await client.query<Row>(
        "select * from private.list_signup_requests()",
      );
      return result.rows;
    });

    const ours = rows.filter((row) =>
      [requests.older, requests.newer, requests.rejected].includes(row.id),
    );
    expect(ours.map((row) => row.business_name)).toEqual([
      "Older Cafe",
      "Newer Cafe",
      "Rejected Cafe",
    ]);
    expect(ours.every((row) => row.email_confirmed === false)).toBe(true);
  });

  it("filters by status and searches the applicant", async () => {
    await asUser(ids.admin, async (client) => {
      const pending = await client.query<Row>(
        "select * from private.list_signup_requests('pending')",
      );
      const ours = pending.rows.filter((row) =>
        [requests.older, requests.newer, requests.rejected].includes(row.id),
      );
      expect(ours.map((row) => row.business_name)).toEqual([
        "Older Cafe",
        "Newer Cafe",
      ]);

      const found = await client.query<Row>(
        "select * from private.list_signup_requests(null, 'rejected@example')",
      );
      expect(found.rows.map((row) => row.id)).toContain(requests.rejected);
      expect(found.rows.map((row) => row.id)).not.toContain(requests.older);
    });
  });

  it("refuses a status the panel does not offer", async () => {
    await asUser(ids.admin, async (client) => {
      const error = await refusal(
        client,
        "select * from private.list_signup_requests('deleted')",
        [],
      );
      expect(error.code).toBe("22023");
    });
  });

  it("returns one row by id, and nothing for an unknown id", async () => {
    await asUser(ids.admin, async (client) => {
      const found = await client.query<Row>(
        "select * from private.get_signup_request($1)",
        [requests.older],
      );
      expect(found.rows).toHaveLength(1);
      expect(found.rows[0].business_name).toBe("Older Cafe");

      const missing = await client.query(
        "select * from private.get_signup_request($1)",
        [randomUUID()],
      );
      expect(missing.rowCount).toBe(0);
    });
  });

  it("refuses a signed-in account that is not an admin", async () => {
    await asUser(ids.stranger, async (client) => {
      for (const sql of [
        "select * from private.list_signup_requests()",
        "select * from private.get_signup_request($1)",
      ]) {
        const error = await refusal(
          client,
          sql,
          sql.includes("$1") ? [requests.older] : [],
        );
        expect(error.code).toBe("42501");
        expect(error.message).toBe(
          "Only a platform admin can read registrations.",
        );
      }
    });
  });

  it("refuses a caller with no session at all", async () => {
    await asUser(null, async (client) => {
      const error = await refusal(
        client,
        "select * from private.list_signup_requests()",
        [],
      );
      expect(error.code).toBe("42501");
    });
  });
});

describe("private.admin_overview", () => {
  it("counts the queue and includes recent decisions for an admin", async () => {
    const overview = await asUser(ids.admin, async (client) => {
      const result = await client.query<{
        overview: {
          pending: number;
          businesses: number;
          accounts: number;
          unconfirmed: number;
          decidedThisWeek: number;
          recent: { id: string; status: string; businessName: string }[];
        };
      }>("select private.admin_overview() as overview");
      return result.rows[0].overview;
    });

    // Other test files share this database, so counts are asserted as at-least.
    expect(overview.pending).toBeGreaterThanOrEqual(1);
    expect(overview.accounts).toBeGreaterThanOrEqual(3);
    expect(overview.decidedThisWeek).toBeGreaterThanOrEqual(1);
    expect(overview.unconfirmed).toBeGreaterThanOrEqual(1);
    expect(overview.recent.map((row) => row.id)).toContain(requests.rejected);
  });

  it("refuses a signed-in account that is not an admin", async () => {
    await asUser(ids.reviewer, async (client) => {
      const error = await refusal(
        client,
        "select private.admin_overview()",
        [],
      );
      expect(error.code).toBe("42501");
      expect(error.message).toBe(
        "Only a platform admin can read the admin overview.",
      );
    });
  });
});
