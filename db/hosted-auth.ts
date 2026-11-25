import { Pool } from "pg";
import type { AuthIdentity } from "../src/lib/auth-shim";
import { hostedOwnerUrl, hostedSsl } from "./env";

/**
 * Read identity from the hosted project's own `auth.users`.
 *
 * Only the development CLIs call this: it needs the owner connection
 * (`SUPABASE_DB_URL`), which the app never uses and no deployed request path holds.
 * Reading the hosted row is what makes a link a copy rather than a guess —
 * `email_confirmed_at`, `created_at` and the registration metadata are only known
 * here, and the local shim has to carry them for the panel to tell the truth.
 *
 * A selector is an id or an email; no selector reads every account, which is what a
 * local database that was wiped needs.
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = {
  id: string;
  email: string;
  email_confirmed_at: Date | null;
  created_at: Date;
  raw_user_meta_data: Record<string, unknown> | null;
};

const COLUMNS = `select id, email, email_confirmed_at, created_at,
                        raw_user_meta_data
                   from auth.users
                  where email is not null`;

export async function fetchHostedIdentities(
  selector?: string,
): Promise<AuthIdentity[]> {
  const pool = new Pool({
    connectionString: hostedOwnerUrl(),
    max: 1,
    ssl: hostedSsl(),
  });

  let rows: Row[];
  try {
    if (!selector) {
      rows = (await pool.query<Row>(`${COLUMNS} order by email`)).rows;
    } else if (UUID_PATTERN.test(selector)) {
      rows = (await pool.query<Row>(`${COLUMNS} and id = $1`, [selector])).rows;
    } else {
      rows = (
        await pool.query<Row>(`${COLUMNS} and lower(email) = $1`, [
          selector.trim().toLowerCase(),
        ])
      ).rows;
    }
  } finally {
    await pool.end();
  }

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    emailConfirmedAt: row.email_confirmed_at,
    createdAt: row.created_at,
    metadata: row.raw_user_meta_data ?? {},
  }));
}
