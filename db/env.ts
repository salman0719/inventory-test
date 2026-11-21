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
