import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { databaseUrl } from "../../db/env";

/**
 * Registration and manual approval, against real Postgres as `authenticated`.
 *
 * The point of these tests is the boundary, not the happy path: an applicant may
 * file one request and read it back, and may not approve themselves, read someone
 * else's request, or reach a table they have no tenancy in. Approval is the only
 * thing that creates a business, and repeating it must not create a second one.
 */

const pool = new Pool({ connectionString: databaseUrl(), max: 2 });

const ids = {
  applicant: randomUUID(),
  secondApplicant: randomUUID(),
  stranger: randomUUID(),
  admin: randomUUID(),
};

const createdBusinesses: string[] = [];

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

/** Same identity, but the work is kept: a filed registration has to outlive the call. */
async function asUserCommitting<T>(
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

/** Run a statement expected to fail, keeping the transaction usable. */
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

async function fileRequest(userId: string, email: string) {
  return asUserCommitting(userId, async (client) => {
    const result = await client.query<{ id: string; status: string }>(
      `insert into signup_requests
         (user_id, email, full_name, business_name, business_type)
       values ($1, $2, 'Test Applicant', 'Applicant Cafe', 'cafe')
       returning id, status`,
      [userId, email],
    );
    return result.rows[0];
  });
}

beforeAll(async () => {
  await pool.query(
    "insert into auth.users (id, email) select id, 'signup-' || id || '@example.invalid' from unnest($1::uuid[]) as t(id)",
    [[ids.applicant, ids.secondApplicant, ids.stranger, ids.admin]],
  );
  await pool.query("insert into platform_admins (user_id) values ($1)", [
    ids.admin,
  ]);
});

afterAll(async () => {
  const businesses =
    createdBusinesses.length > 0 ? createdBusinesses : [randomUUID()];
  await pool.query(
    "delete from business_members where business_id = any($1::uuid[])",
    [businesses],
  );
  await pool.query("delete from businesses where id = any($1::uuid[])", [
    businesses,
  ]);
  await pool.query(
    "delete from signup_requests where user_id = any($1::uuid[])",
    [[ids.applicant, ids.secondApplicant, ids.stranger, ids.admin]],
  );
  await pool.query(
    "delete from platform_admins where user_id = any($1::uuid[])",
    [[ids.admin]],
  );
  await pool.query("delete from auth.users where id = any($1::uuid[])", [
    [ids.applicant, ids.secondApplicant, ids.stranger, ids.admin],
  ]);
  await pool.end();
});

describe("signup_requests", () => {
  it("lets an applicant file one pending request", async () => {
    await asUserCommitting(ids.applicant, async (client) => {
      const request = await client.query<{ status: string }>(
        `insert into signup_requests
           (user_id, email, full_name, business_name, business_type)
         values ($1, 'applicant@example.invalid', 'Test Applicant',
                 'Applicant Cafe', 'cafe')
         returning status`,
        [ids.applicant],
      );
      expect(request.rows[0].status).toBe("pending");

      const duplicate = await refusal(
        client,
        `insert into signup_requests
           (user_id, email, full_name, business_name, business_type)
         values ($1, 'applicant@example.invalid', 'Test Applicant',
                 'Second Cafe', 'cafe')`,
        [ids.applicant],
      );
      expect(duplicate.code).toBe("23505");
    });
  });

  it("refuses a request that arrives already approved", async () => {
    await asUser(ids.stranger, async (client) => {
      const error = await refusal(
        client,
        `insert into signup_requests
           (user_id, email, full_name, business_name, business_type, status)
         values ($1, 'stranger@example.invalid', 'Test Applicant', 'Sneaky Cafe',
                 'cafe', 'approved')`,
        [ids.stranger],
      );
      expect(error.code).toBe("42501");
    });
  });

  it("shows an applicant their own request and nobody else's", async () => {
    await fileRequest(ids.secondApplicant, "second@example.invalid");

    await asUser(ids.stranger, async (client) => {
      const rows = await client.query(
        "select id from signup_requests where user_id = $1",
        [ids.applicant],
      );
      expect(rows.rowCount).toBe(0);
    });

    await asUser(ids.applicant, async (client) => {
      const rows = await client.query<{ business_name: string }>(
        "select business_name from signup_requests",
      );
      expect(rows.rows.map((row) => row.business_name)).toEqual([
        "Applicant Cafe",
      ]);
    });
  });

  it("does not let an applicant promote their own request", async () => {
    await asUser(ids.applicant, async (client) => {
      const updated = await client.query(
        "update signup_requests set status = 'approved' where user_id = $1",
        [ids.applicant],
      );
      expect(updated.rowCount).toBe(0);
    });

    const still = await pool.query<{ status: string }>(
      "select status from signup_requests where user_id = $1",
      [ids.applicant],
    );
    expect(still.rows[0].status).toBe("pending");
  });
});

describe("private.approve_signup_request", () => {
  it("refuses a signed-in caller who is not an admin", async () => {
    const request = await pool.query<{ id: string }>(
      "select id from signup_requests where user_id = $1",
      [ids.applicant],
    );

    await asUser(ids.stranger, async (client) => {
      const error = await refusal(
        client,
        "select private.approve_signup_request($1)",
        [request.rows[0].id],
      );
      expect(error.code).toBe("42501");
      expect(error.message).toBe(
        "Only a platform admin can approve a registration.",
      );
    });

    const businesses = await pool.query(
      "select 1 from businesses where name = 'Applicant Cafe'",
    );
    expect(businesses.rowCount).toBe(0);
  });

  it("creates the business and the owner, once", async () => {
    const request = await pool.query<{ id: string }>(
      "select id from signup_requests where user_id = $1",
      [ids.applicant],
    );

    const first = await asUserCommitting(ids.admin, async (client) => {
      const result = await client.query<{
        approved: {
          businessId: string;
          businessName: string;
          alreadyApproved: boolean;
        };
      }>("select private.approve_signup_request($1) as approved", [
        request.rows[0].id,
      ]);
      return result.rows[0].approved;
    });
    createdBusinesses.push(first.businessId);
    expect(first.alreadyApproved).toBe(false);
    expect(first.businessName).toBe("Applicant Cafe");

    const membership = await pool.query<{ role: string }>(
      "select role from business_members where business_id = $1 and user_id = $2",
      [first.businessId, ids.applicant],
    );
    expect(membership.rows[0].role).toBe("owner");

    const decided = await pool.query<{
      status: string;
      business_id: string;
      decided_by: string;
    }>(
      "select status, business_id, decided_by from signup_requests where user_id = $1",
      [ids.applicant],
    );
    expect(decided.rows[0]).toMatchObject({
      status: "approved",
      business_id: first.businessId,
      decided_by: ids.admin,
    });

    const second = await asUser(ids.admin, async (client) => {
      const result = await client.query<{
        approved: { businessId: string; alreadyApproved: boolean };
      }>("select private.approve_signup_request($1) as approved", [
        request.rows[0].id,
      ]);
      return result.rows[0].approved;
    });
    expect(second.alreadyApproved).toBe(true);
    expect(second.businessId).toBe(first.businessId);

    const count = await pool.query<{ n: number }>(
      "select count(*)::int as n from businesses where name = 'Applicant Cafe'",
    );
    expect(count.rows[0].n).toBe(1);
  });

  it("refuses a request that was rejected", async () => {
    const request = await pool.query<{ id: string }>(
      "select id from signup_requests where user_id = $1",
      [ids.secondApplicant],
    );

    const rejected = await asUserCommitting(ids.admin, async (client) => {
      const result = await client.query<{ rejected: { status: string } }>(
        "select private.reject_signup_request($1, $2) as rejected",
        [request.rows[0].id, "  Not a real business.  "],
      );
      const stored = await client.query<{ admin_note: string; status: string }>(
        "select admin_note, status from signup_requests where user_id = $1",
        [ids.secondApplicant],
      );
      expect(stored.rows[0]).toEqual({
        admin_note: "Not a real business.",
        status: "rejected",
      });
      return result.rows[0].rejected;
    });
    expect(rejected.status).toBe("rejected");

    await asUser(ids.admin, async (client) => {
      const error = await refusal(
        client,
        "select private.approve_signup_request($1)",
        [request.rows[0].id],
      );
      expect(error.code).toBe("22023");
      expect(error.message).toBe("That registration was rejected.");
    });
  });

  it("refuses a call with no signed-in user and no admin", async () => {
    const request = await pool.query<{ id: string }>(
      "select id from signup_requests where user_id = $1",
      [ids.secondApplicant],
    );

    await asUser(null, async (client) => {
      const error = await refusal(
        client,
        "select private.approve_signup_request($1)",
        [request.rows[0].id],
      );
      expect(error.code).toBe("42501");
    });
  });
});
