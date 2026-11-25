import { Client } from "pg";
import { databaseUrl, needsAuthShim } from "../../db/env";

/**
 * The local `auth.users` shim, kept in step with hosted Supabase Auth.
 *
 * Local development signs in through hosted GoTrue and reads the local compose
 * database, whose `auth` schema is a stand-in (`db/dev/0001-auth-shim.sql`). GoTrue
 * writes its row in the hosted project, so a new account has no local row and the
 * registration the confirmation link tries to file fails `signup_requests_user_fk`.
 * `/auth/confirm` calls `syncDevAuthUser` with the account it just verified — the one
 * moment the app holds the confirmed identity — so the row exists before the
 * registration is written.
 *
 * Development-only by construction: `syncDevAuthUser` runs only when `DATABASE_URL`
 * is a loopback database (`needsAuthShim`, the rule the migrations use), and it
 * connects with the compose owner role, which no deployed environment has. Against
 * Supabase this file does nothing: GoTrue owns `auth.users` there.
 */

export type AuthIdentity = {
  id: string;
  email: string;
  emailConfirmedAt: Date | null;
  createdAt: Date;
  metadata: Record<string, unknown>;
};

/** What a caller can say afterwards; the route only logs the failure. */
export type ShimWrite = "written" | "skipped" | "failed";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The local database as a connection string, or a refusal.
 *
 * Stricter than `needsAuthShim`: `DB_AUTH_SHIM=1` exists so a migration can be run
 * against a database it does not recognise, but no script should ever copy accounts
 * into a non-loopback `auth.users`. This is what the CLIs use.
 */
export function localDatabaseUrl(): string {
  const url = databaseUrl();
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `refusing to write auth.users outside the local database (${host})`,
    );
  }
  return url;
}

/**
 * Write one account into the shim, replacing whatever was there.
 *
 * All four fields the app reads are copied: the panel joins `email`, counts accounts
 * by `email_confirmed_at`, shows `created_at` as the join date, and `0012` files a
 * registration from `raw_user_meta_data`. A row with only `(id, email)` — what
 * `db:link-user` used to write — made a working account look unconfirmed and newly
 * joined. Confirmation is only ever moved forward: a later write without the
 * timestamp (a recovery link, say) must not un-confirm an account.
 */
export async function writeAuthIdentity(
  client: Client,
  identity: AuthIdentity,
): Promise<{ inserted: boolean }> {
  const result = await client.query<{ inserted: boolean }>(
    `insert into auth.users
       (id, email, email_confirmed_at, created_at, raw_user_meta_data)
     values ($1, $2, $3, $4, $5::jsonb)
     on conflict (id) do update
       set email = excluded.email,
           email_confirmed_at = coalesce(
             excluded.email_confirmed_at,
             auth.users.email_confirmed_at
           ),
           created_at = excluded.created_at,
           raw_user_meta_data = excluded.raw_user_meta_data
     returning (xmax = 0) as inserted`,
    [
      identity.id,
      identity.email,
      identity.emailConfirmedAt,
      identity.createdAt,
      JSON.stringify(identity.metadata),
    ],
  );
  return { inserted: result.rows[0]?.inserted === true };
}

/**
 * Record a verified account locally, from the confirm route.
 *
 * Never throws: a shim that cannot be written must not stop a confirmed account from
 * reaching the app. It logs and answers `failed`, and the registration write that
 * follows reports its own failure the way it always has.
 */
export async function syncDevAuthUser(
  identity: AuthIdentity,
): Promise<ShimWrite> {
  const url = process.env.DATABASE_URL;
  if (!url || !needsAuthShim(url)) return "skipped";

  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    await writeAuthIdentity(client, identity);
    return "written";
  } catch (error) {
    console.error("auth-shim: could not record the account locally", error);
    return "failed";
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * The identity fields Supabase Auth returned, or null when the account has no email.
 *
 * `email_confirmed_at` is left null when it is absent rather than assumed: a recovery
 * or email-change link opens on an account that may or may not be confirmed, and the
 * database side only moves confirmation forward.
 */
export function shimIdentityFromUser(
  user: {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown> | null;
    email_confirmed_at?: string | null;
    created_at?: string | null;
  },
  now: Date = new Date(),
): AuthIdentity | null {
  const email = user.email?.trim().toLowerCase();
  if (!email) return null;

  return {
    id: user.id,
    email,
    emailConfirmedAt: asDate(user.email_confirmed_at),
    createdAt: asDate(user.created_at) ?? now,
    metadata: user.user_metadata ?? {},
  };
}

function asDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
