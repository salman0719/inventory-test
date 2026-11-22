import { Pool, type PoolClient } from "pg";
import { timed } from "./nav-timing";

/**
 * Application database access.
 *
 * The app never connects as the owner role. It connects as `app_user`, and every
 * unit of work runs inside a transaction that sets `role` to `authenticated` and
 * puts the signed-in user's id in `request.jwt.claims`. `SET LOCAL` is required
 * because the transaction pooler hands a server connection to another client
 * afterwards; a session-level `SET ROLE` would leak identity between tenants.
 *
 * This mirrors what the isolation tests prove in CI, so the policies — not the
 * application's `where` clauses — are what separate businesses.
 */
let pool: Pool | undefined;

function appDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_APP;
  if (!url) {
    throw new Error(
      "DATABASE_URL_APP is not set. Run `npm run db:app-role:local` for the local database.",
    );
  }
  return url;
}

/** The Supavisor pooler presents a self-signed chain; keep the connection encrypted. */
function sslFor(url: string): { rejectUnauthorized: boolean } | undefined {
  return url.includes("pooler.supabase.com")
    ? { rejectUnauthorized: false }
    : undefined;
}

function getPool(): Pool {
  if (!pool) {
    const url = appDatabaseUrl();
    pool = new Pool({ connectionString: url, max: 4, ssl: sslFor(url) });
  }
  return pool;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Open a transaction, or join the one this page already opened.
 *
 * A page used to take one connection per read: fetch the list, take a connection;
 * fetch the categories, take another. `withTenant` accepts a caller's client so a
 * page-level read can pass the same one down, and each function keeps working on its
 * own for the callers that only make one query (a panel, a server action).
 */
export async function runInTenant<T>(
  userId: string,
  client: PoolClient | undefined,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return client ? fn(client) : withTenant(userId, fn);
}

/** Run `fn` as the authenticated user, inside one transaction. */
export async function withTenant<T>(
  userId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!UUID_PATTERN.test(userId))
    throw new Error("withTenant requires a user id.");

  const client = await timed("tenant.connect", () => getPool().connect());
  try {
    await timed("tenant.setup", async () => {
      // One round trip, not three. The claims literal is inlined because the simple
      // query protocol is what allows `begin; set local role; select set_config` to
      // run as one statement, and parameters are not available in it. That is safe
      // only because `userId` was checked against a UUID pattern above, so it cannot
      // carry a quote.
      const claims = JSON.stringify({ sub: userId, role: "authenticated" });
      await client.query(
        `begin;\n set local role authenticated;\n select set_config('request.jwt.claims', '${claims}', true);`,
      );
    });
    const result = await timed("tenant.work", () => fn(client));
    await timed("tenant.commit", () => client.query("commit"));
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
