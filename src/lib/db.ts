import { Pool } from "pg";

/**
 * Server-only Postgres access.
 *
 * Slice 1 runs before authentication, so it reads the local compose database
 * through `DATABASE_URL` (the owner connection). Once authentication and the
 * request path land, every query moves to `DATABASE_URL_APP` inside a transaction
 * that sets `role` to `authenticated` — see docs/decisions/0007-gate-c-approval.md.
 *
 * The hosted fallback keeps the stage deployment rendering: `DATABASE_URL` is
 * deliberately absent in Vercel, and `app_user` returns nothing without claims,
 * so the shell shows its empty state rather than failing.
 */
let pool: Pool | undefined;

function connectionString(): string {
  const url = process.env.DATABASE_URL ?? process.env.DATABASE_URL_APP;
  if (!url) {
    throw new Error(
      "Neither DATABASE_URL nor DATABASE_URL_APP is set. Run `npm run db:up` and `npm run db:seed`.",
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

export function getPool(): Pool {
  if (!pool) {
    const url = connectionString();
    pool = new Pool({ connectionString: url, max: 4, ssl: sslFor(url) });
  }
  return pool;
}
