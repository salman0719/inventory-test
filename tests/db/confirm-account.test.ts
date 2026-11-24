import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { databaseUrl } from "../../db/env";

/**
 * A reviewer vouching for an address.
 *
 * Two things have to hold together: the address becomes confirmed even though the
 * application role cannot write `auth.users`, and the registration the sign-up form
 * stored is filed in the same transaction — otherwise the account signs in and still
 * cannot be approved. A stale or rejected decision must survive, and nobody off the
 * admin list may do any of it.
 */

const pool = new Pool({ connectionString: databaseUrl(), max: 2 });

const ids = {
  admin: randomUUID(),
  stranger: randomUUID(),
  applicant: randomUUID(),
  invited: randomUUID(),
  partial: randomUUID(),
  badType: randomUUID(),
  decided: randomUUID(),
};

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

type Confirmation = {
  userId: string;
  email: string;
  alreadyConfirmed: boolean;
  requestFiled: boolean;
  registrationStatus: string | null;
};

async function confirm(userId: string): Promise<Confirmation> {
  return asUserCommitting(ids.admin, async (client) => {
    const result = await client.query<{ confirmed: Confirmation }>(
      "select private.confirm_account($1) as confirmed",
      [userId],
    );
    return result.rows[0].confirmed;
  });
}

async function accountState(userId: string) {
  const user = await pool.query<{ confirmed: boolean }>(
    "select email_confirmed_at is not null as confirmed from auth.users where id = $1",
    [userId],
  );
  const request = await pool.query<{
    status: string;
    admin_note: string | null;
  }>("select status, admin_note from signup_requests where user_id = $1", [
    userId,
  ]);
  return {
    confirmed: user.rows[0]?.confirmed,
    request: request.rows[0] ?? null,
  };
}

const answers = (fullName: string, businessName: string, type = "cafe") =>
  JSON.stringify({
    full_name: fullName,
    business_name: businessName,
    business_type: type,
  });

beforeAll(async () => {
  const users = [
    ["admin", "confirm-admin", null],
    ["stranger", "confirm-stranger", null],
    ["applicant", "confirm-applicant", answers("Rae Applicant", "Rae's Cafe")],
    ["invited", "confirm-invited", null],
    ["partial", "confirm-partial", JSON.stringify({ full_name: "Only Name" })],
    [
      "badType",
      "confirm-bad-type",
      answers("Bea Bad", "Bea's Bar", "nightclub"),
    ],
    ["decided", "confirm-decided", answers("Dan Decided", "Dan's Deli")],
  ] as const;

  for (const [key, handle, metadata] of users) {
    await pool.query(
      "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, coalesce($3::jsonb, '{}'::jsonb))",
      [ids[key], `${handle}@example.invalid`, metadata],
    );
  }
  await pool.query("insert into platform_admins (user_id) values ($1)", [
    ids.admin,
  ]);

  // A rejection that must survive a later confirmation.
  await pool.query(
    `insert into signup_requests
       (user_id, email, full_name, business_name, business_type, status,
        admin_note, decided_by, decided_at)
     values ($1, 'confirm-decided@example.invalid', 'Dan Decided', 'Dan''s Deli',
             'cafe', 'rejected', 'Could not verify.', $2, now())`,
    [ids.decided, ids.admin],
  );
});

afterAll(async () => {
  await pool.query(
    "delete from signup_requests where user_id = any($1::uuid[])",
    [[ids.applicant, ids.invited, ids.partial, ids.badType, ids.decided]],
  );
  await pool.query(
    "delete from platform_admins where user_id = any($1::uuid[])",
    [[ids.admin]],
  );
  await pool.query("delete from auth.users where id = any($1::uuid[])", [
    [
      ids.admin,
      ids.stranger,
      ids.applicant,
      ids.invited,
      ids.partial,
      ids.badType,
      ids.decided,
    ],
  ]);
  await pool.end();
});

describe("private.confirm_account", () => {
  it("confirms the address and files the registration in one step", async () => {
    const result = await confirm(ids.applicant);

    expect(result.alreadyConfirmed).toBe(false);
    expect(result.requestFiled).toBe(true);
    expect(result.registrationStatus).toBe("pending");
    expect(result.email).toBe("confirm-applicant@example.invalid");

    const state = await accountState(ids.applicant);
    expect(state.confirmed).toBe(true);
    expect(state.request).toEqual({ status: "pending", admin_note: null });

    const filed = await pool.query<{
      email: string;
      full_name: string;
      business_name: string;
      business_type: string;
    }>(
      "select email, full_name, business_name, business_type from signup_requests where user_id = $1",
      [ids.applicant],
    );
    expect(filed.rows[0]).toEqual({
      email: "confirm-applicant@example.invalid",
      full_name: "Rae Applicant",
      business_name: "Rae's Cafe",
      business_type: "cafe",
    });
  });

  it("puts the filed registration in the queue the panel reads", async () => {
    const rows = await asUser(ids.admin, async (client) => {
      const result = await client.query<{ email: string; status: string }>(
        "select * from private.list_signup_requests('pending', $1)",
        ["confirm-applicant@"],
      );
      return result.rows.map((row) => ({
        email: row.email,
        status: row.status,
      }));
    });
    expect(rows).toEqual([
      { email: "confirm-applicant@example.invalid", status: "pending" },
    ]);
  });

  it("repeats without duplicating the request or changing the role of nothing", async () => {
    const again = await confirm(ids.applicant);
    expect(again.alreadyConfirmed).toBe(true);
    expect(again.requestFiled).toBe(true);

    const count = await pool.query<{ n: number }>(
      "select count(*)::int as n from signup_requests where user_id = $1",
      [ids.applicant],
    );
    expect(count.rows[0].n).toBe(1);
  });

  it("confirms an account that has no registration answers, and files nothing", async () => {
    const result = await confirm(ids.invited);

    expect(result.alreadyConfirmed).toBe(false);
    expect(result.requestFiled).toBe(false);
    expect(result.registrationStatus).toBeNull();

    const state = await accountState(ids.invited);
    expect(state.confirmed).toBe(true);
    expect(state.request).toBeNull();
  });

  it("does not invent a registration from a partial answer set", async () => {
    const result = await confirm(ids.partial);
    expect(result.requestFiled).toBe(false);

    const state = await accountState(ids.partial);
    expect(state.confirmed).toBe(true);
    expect(state.request).toBeNull();
  });

  it("leaves a rejected decision exactly as it was", async () => {
    const result = await confirm(ids.decided);
    expect(result.alreadyConfirmed).toBe(false);
    expect(result.requestFiled).toBe(true);
    expect(result.registrationStatus).toBe("rejected");

    const state = await accountState(ids.decided);
    expect(state.request).toEqual({
      status: "rejected",
      admin_note: "Could not verify.",
    });
  });

  it("refuses unusable answers instead of confirming", async () => {
    await asUser(ids.admin, async (client) => {
      const error = await refusal(
        client,
        "select private.confirm_account($1)",
        [ids.badType],
      );
      expect(error.code).toBe("22023");
      expect(error.message).toBe(
        "The registration answers on that account are not valid.",
      );
    });

    const state = await accountState(ids.badType);
    expect(state.confirmed).toBe(false);
    expect(state.request).toBeNull();
  });

  it("refuses an account that does not exist", async () => {
    await asUser(ids.admin, async (client) => {
      const error = await refusal(
        client,
        "select private.confirm_account($1)",
        [randomUUID()],
      );
      expect(error.code).toBe("P0002");
      expect(error.message).toBe("That account does not exist.");
    });
  });

  it("refuses a signed-in account that is not an admin, and changes nothing", async () => {
    await asUser(ids.stranger, async (client) => {
      const error = await refusal(
        client,
        "select private.confirm_account($1)",
        [ids.invited],
      );
      expect(error.code).toBe("42501");
      expect(error.message).toBe(
        "Only a platform admin can confirm an account.",
      );
    });

    const state = await accountState(ids.invited);
    expect(state.confirmed).toBe(true); // confirmed earlier by the admin, untouched
  });

  it("refuses a caller with no session at all", async () => {
    await asUser(null, async (client) => {
      const error = await refusal(
        client,
        "select private.confirm_account($1)",
        [ids.invited],
      );
      expect(error.code).toBe("42501");
    });
  });
});
