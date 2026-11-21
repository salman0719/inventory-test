import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * tsx scripts do not get Next.js env loading, so read `.env.local` then `.env`.
 * Values already present in the environment win: CI sets DATABASE_URL directly.
 */
export function loadEnv(): void {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    try {
      process.loadEnvFile(path);
    } catch {
      // A malformed or unreadable file is not fatal: an explicit env var may
      // already be set, and databaseUrl() reports a missing URL clearly.
    }
  }
}

export function databaseUrl(): string {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Run `npm run new:ports` or add it to .env.local.",
    );
  }
  return url;
}

/**
 * The hosted owner connection, used only for migrations.
 *
 * Supavisor exposes the same host on 5432 (session mode) and 6543 (transaction
 * mode). Migrations need session mode: Drizzle takes a session-level advisory
 * lock, which a transaction pooler can hand to a different backend on unlock.
 * The dashboard's default connection string is the transaction pooler, so a
 * 6543 URL is switched to 5432 here and the switch is logged.
 */
export function hostedOwnerUrl(): string {
  loadEnv();
  const raw = process.env.SUPABASE_DB_URL;
  if (!raw) {
    throw new Error(
      "SUPABASE_DB_URL is not set. Add the Supabase session pooler owner URL to .env.local.",
    );
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("SUPABASE_DB_URL is not a valid URL.");
  }

  if (url.port === "6543") {
    url.port = "5432";
    console.log(
      "hosted: URL uses the transaction pooler (6543); switching to session mode (5432) for migrations",
    );
  }

  return url.toString();
}

/**
 * Hosted Supabase requires TLS; compose and the CI service do not offer it.
 *
 * The Supavisor pooler presents a self-signed chain, so verification fails even
 * though the connection is encrypted. This matches `sslmode=require` in
 * Supabase's own connection strings: encryption without CA verification. It is
 * the same trust level the dashboard string would give, not a weaker one.
 */
export function hostedSsl(): { rejectUnauthorized: boolean } {
  return { rejectUnauthorized: false };
}

/**
 * The `auth.uid()` shim belongs to development and CI only. Hosted Supabase
 * already owns the `auth` schema. Decide by host so no extra variable is needed,
 * with DB_AUTH_SHIM=1|0 as an explicit override.
 */
export function needsAuthShim(url: string): boolean {
  const override = process.env.DB_AUTH_SHIM;
  if (override === "1") return true;
  if (override === "0") return false;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}
