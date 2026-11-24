import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { databaseUrl } from "../../db/env";

/**
 * Approval that reuses a business, and the duplicate suggestion that leads a reviewer
 * to it.
 *
 * The thing worth guarding is that a second approval path did not weaken the first:
 * with no target the applicant still gets a new business as its owner; with a target
 * no business is created and the membership is the only thing added. Ownership stays
 * out of reach of the queue, and a non-admin can do neither.
 */

const pool = new Pool({ connectionString: databaseUrl(), max: 2 });

const ids = {
  admin: randomUUID(),
  stranger: randomUUID(),
  owner: randomUUID(),
  applicant: randomUUID(),
  second: randomUUID(),
  third: randomUUID(),
};

const requests: Record<string, string> = {};
const createdBusinesses: string[] = [];
let existingBusiness = "";
const existingName = "Attach Target Cafe";

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

/** Same identity, work kept: an approval has to outlive the call. */
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

async function approve(
  requestId: string,
  businessId: string | null = null,
  role = "owner",
) {
  return asUserCommitting(ids.admin, async (client) => {
    const result = await client.query<{
      approved: {
        businessId: string;
        businessName: string;
        alreadyApproved: boolean;
        role: string;
      };
    }>("select private.approve_signup_request($1, $2, $3) as approved", [
      requestId,
      businessId,
      role,
    ]);
    return result.rows[0].approved;
  });
}

beforeAll(async () => {
  const users = [
    ["admin", "attach-admin"],
    ["stranger", "attach-stranger"],
    ["owner", "attach-owner"],
    ["applicant", "attach-applicant"],
    ["second", "attach-second"],
    ["third", "attach-third"],
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

  const business = await pool.query<{ id: string }>(
    "insert into businesses (name, business_type) values ($1, 'cafe') returning id",
    [existingName],
  );
  existingBusiness = business.rows[0].id;
  await pool.query(
    "insert into business_members (business_id, user_id, role) values ($1, $2, 'owner')",
    [existingBusiness, ids.owner],
  );

  const rows = [
    ["applicant", "Attach Target Cafe"],
    ["second", "Fresh Attachment Cafe"],
    ["third", "Refuse Owner Cafe"],
  ] as const;

  for (const [key, business_name] of rows) {
    const result = await pool.query<{ id: string }>(
      `insert into signup_requests
         (user_id, email, full_name, business_name, business_type)
       values ($1, $2, 'Attach Applicant', $3, 'cafe')
       returning id`,
      [ids[key], `${key}@example.invalid`, business_name],
    );
    requests[key] = result.rows[0].id;
  }
});

afterAll(async () => {
  const businesses = [existingBusiness, ...createdBusinesses].filter(
    (id) => id !== "",
  );
  await pool.query(
    "delete from business_members where business_id = any($1::uuid[])",
    [businesses.length > 0 ? businesses : [randomUUID()]],
  );
  await pool.query("delete from businesses where id = any($1::uuid[])", [
    businesses.length > 0 ? businesses : [randomUUID()],
  ]);
  await pool.query(
    "delete from signup_requests where user_id = any($1::uuid[])",
    [[ids.applicant, ids.second, ids.third]],
  );
  await pool.query(
    "delete from platform_admins where user_id = any($1::uuid[])",
    [[ids.admin]],
  );
  await pool.query("delete from auth.users where id = any($1::uuid[])", [
    [ids.admin, ids.stranger, ids.owner, ids.applicant, ids.second, ids.third],
  ]);
  await pool.end();
});

describe("private.match_businesses", () => {
  it("finds the same business through case, punctuation and filler words", async () => {
    await asUser(ids.admin, async (client) => {
      for (const name of [
        "Attach Target Cafe",
        "attach target cafe",
        "Attach Target & Cafe",
        "The Attach Target Cafe",
      ]) {
        const result = await client.query<{
          id: string;
          exact: boolean;
          owner_email: string;
          members: number;
        }>("select * from private.match_businesses($1)", [name]);
        const match = result.rows.find((row) => row.id === existingBusiness);
        expect(match, name).toBeDefined();
        expect(match?.exact, name).toBe(true);
        expect(match?.owner_email).toBe("attach-owner@example.invalid");
        expect(match?.members).toBe(1);
      }
    });
  });

  it("returns nothing for a name that resembles no business", async () => {
    await asUser(ids.admin, async (client) => {
      const result = await client.query(
        "select * from private.match_businesses($1)",
        ["Harbour Pilates Studio"],
      );
      expect(
        result.rows.filter((row) => row.id === existingBusiness),
      ).toHaveLength(0);
    });
  });

  it("returns nothing for a name with no usable characters", async () => {
    await asUser(ids.admin, async (client) => {
      const result = await client.query(
        "select * from private.match_businesses($1)",
        ["& &"],
      );
      expect(result.rowCount).toBe(0);
    });
  });

  it("refuses a signed-in account that is not an admin", async () => {
    await asUser(ids.stranger, async (client) => {
      const error = await refusal(
        client,
        "select * from private.match_businesses($1)",
        [existingName],
      );
      expect(error.code).toBe("42501");
      expect(error.message).toBe("Only a platform admin can read businesses.");
    });
  });
});

describe("private.get_admin_business", () => {
  it("returns the business and its counts to an admin", async () => {
    await asUser(ids.admin, async (client) => {
      const result = await client.query<{
        name: string;
        members: number;
        owner_email: string;
      }>("select * from private.get_admin_business($1)", [existingBusiness]);
      expect(result.rows[0]).toMatchObject({
        name: existingName,
        members: 1,
        owner_email: "attach-owner@example.invalid",
      });
    });
  });

  it("refuses a signed-in account that is not an admin", async () => {
    await asUser(ids.stranger, async (client) => {
      const error = await refusal(
        client,
        "select * from private.get_admin_business($1)",
        [existingBusiness],
      );
      expect(error.code).toBe("42501");
    });
  });
});

describe("private.approve_signup_request, attaching", () => {
  it("adds a staff membership and creates no business", async () => {
    const before = await pool.query<{ n: number }>(
      "select count(*)::int as n from businesses",
    );

    const approved = await approve(
      requests.applicant,
      existingBusiness,
      "staff",
    );
    expect(approved.alreadyApproved).toBe(false);
    expect(approved.businessId).toBe(existingBusiness);
    expect(approved.businessName).toBe(existingName);
    expect(approved.role).toBe("staff");

    const after = await pool.query<{ n: number }>(
      "select count(*)::int as n from businesses",
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);

    const membership = await pool.query<{ role: string }>(
      "select role from business_members where business_id = $1 and user_id = $2",
      [existingBusiness, ids.applicant],
    );
    expect(membership.rows).toHaveLength(1);
    expect(membership.rows[0].role).toBe("staff");

    const request = await pool.query<{
      status: string;
      business_id: string;
      decided_by: string;
    }>(
      "select status, business_id, decided_by from signup_requests where id = $1",
      [requests.applicant],
    );
    expect(request.rows[0]).toMatchObject({
      status: "approved",
      business_id: existingBusiness,
      decided_by: ids.admin,
    });
  });

  it("gives the applicant access to the business's rows through RLS", async () => {
    await asUser(ids.applicant, async (client) => {
      const result = await client.query<{ name: string; role: string }>(
        `select b.name,
                (select m.role from business_members m
                  where m.business_id = b.id and m.user_id = auth.uid()) as role
           from businesses b`,
      );
      expect(result.rows).toEqual([{ name: existingName, role: "staff" }]);
    });
  });

  it("replays an approval instead of adding a second membership", async () => {
    const replay = await approve(requests.applicant, existingBusiness, "staff");
    expect(replay.alreadyApproved).toBe(true);
    expect(replay.businessId).toBe(existingBusiness);
    expect(replay.role).toBe("staff");

    const members = await pool.query(
      "select 1 from business_members where business_id = $1 and user_id = $2",
      [existingBusiness, ids.applicant],
    );
    expect(members.rowCount).toBe(1);
  });

  it("still creates a business when no target is given", async () => {
    const approved = await approve(requests.second);
    createdBusinesses.push(approved.businessId);

    expect(approved.alreadyApproved).toBe(false);
    expect(approved.role).toBe("owner");
    expect(approved.businessName).toBe("Fresh Attachment Cafe");

    const membership = await pool.query<{ role: string }>(
      "select role from business_members where business_id = $1 and user_id = $2",
      [approved.businessId, ids.second],
    );
    expect(membership.rows[0].role).toBe("owner");
  });

  it("refuses to hand over ownership from the queue", async () => {
    await asUser(ids.admin, async (client) => {
      const error = await refusal(
        client,
        "select private.approve_signup_request($1, $2, $3)",
        [requests.third, existingBusiness, "owner"],
      );
      expect(error.code).toBe("22023");
      expect(error.message).toMatch(/ownership/i);
    });

    const still = await pool.query<{ status: string }>(
      "select status from signup_requests where id = $1",
      [requests.third],
    );
    expect(still.rows[0].status).toBe("pending");
  });

  it("refuses a role that has no business to apply to", async () => {
    await asUser(ids.admin, async (client) => {
      const error = await refusal(
        client,
        "select private.approve_signup_request($1, null, 'staff')",
        [requests.third],
      );
      expect(error.code).toBe("22023");
      expect(error.message).toMatch(/role only applies/i);
    });
  });

  it("refuses a target business that does not exist", async () => {
    await asUser(ids.admin, async (client) => {
      const error = await refusal(
        client,
        "select private.approve_signup_request($1, $2, 'staff')",
        [requests.third, randomUUID()],
      );
      expect(error.code).toBe("P0002");
      expect(error.message).toBe("That business does not exist.");
    });
  });

  it("refuses a non-admin attach and leaves the request waiting", async () => {
    await asUser(ids.stranger, async (client) => {
      const error = await refusal(
        client,
        "select private.approve_signup_request($1, $2, 'staff')",
        [requests.third, existingBusiness],
      );
      expect(error.code).toBe("42501");
    });

    const still = await pool.query<{ status: string }>(
      "select status from signup_requests where id = $1",
      [requests.third],
    );
    expect(still.rows[0].status).toBe("pending");
  });
});
