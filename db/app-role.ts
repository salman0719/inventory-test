import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { hostedOwnerUrl, hostedSsl, loadEnv } from "./env";

/**
 * Create (or rotate) the login role the application connects as, and record its
 * connection string in `.env.local`.
 *
 * The role must not bypass RLS: the owner role can, which is why the application
 * never uses it. Request code connects as `app_user`, then runs
 * `SET LOCAL ROLE authenticated` inside its transaction.
 *
 * Two targets, deliberately separated:
 * - `--local`   compose Postgres (`DATABASE_URL`), writes `DATABASE_URL_APP`.
 * - default     hosted Supabase (`SUPABASE_DB_URL`), writes `SUPABASE_DB_URL_APP`.
 *
 * Idempotent: a re-run rotates the password. Restart `next dev` afterwards.
 */
const ROLE = "app_user";
const LOCAL = process.argv.includes("--local");
const TRANSACTION_PORT = "6543";

function setEnvValue(contents: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(contents)) return contents.replace(pattern, line);
  return `${contents.replace(/\s*$/, "")}\n${line}\n`;
}

async function main(): Promise<void> {
  loadEnv();

  const ownerUrl = LOCAL ? process.env.DATABASE_URL : hostedOwnerUrl();
  if (!ownerUrl) {
    throw new Error(
      "DATABASE_URL is not set. Run `npm run db:up` or `npm run new:ports`.",
    );
  }

  const owner = new Client({
    connectionString: ownerUrl,
    ssl: LOCAL ? undefined : hostedSsl(),
    connectionTimeoutMillis: 20_000,
  });
  await owner.connect();

  try {
    const password = randomBytes(24).toString("base64url");
    const existing = await owner.query<{ rolname: string }>(
      "select rolname from pg_roles where rolname = $1",
      [ROLE],
    );

    if (existing.rowCount) {
      await owner.query(`alter role ${ROLE} with login password '${password}'`);
      console.log(`app-role: ${ROLE} already existed; password rotated`);
    } else {
      await owner.query(
        `create role ${ROLE} with login password '${password}' noinherit ` +
          "nosuperuser nocreatedb nocreaterole noreplication nobypassrls",
      );
      console.log(`app-role: created ${ROLE}`);
    }

    await owner.query(`grant authenticated to ${ROLE}`);

    const check = await owner.query<{
      rolbypassrls: boolean;
      rolsuper: boolean;
      rolcanlogin: boolean;
    }>(
      "select rolbypassrls, rolsuper, rolcanlogin from pg_roles where rolname = $1",
      [ROLE],
    );
    const flags = check.rows[0];
    if (!flags || flags.rolbypassrls || flags.rolsuper || !flags.rolcanlogin) {
      throw new Error(
        `app-role: ${ROLE} has unsafe attributes: ${JSON.stringify(flags)}`,
      );
    }
    console.log(
      "app-role: verified login, no superuser, no bypassrls, member of authenticated",
    );

    const appUrl = new URL(ownerUrl);
    if (LOCAL) {
      appUrl.username = ROLE;
      appUrl.password = password;
    } else {
      const ownerUser = appUrl.username;
      const projectRef = ownerUser.includes(".")
        ? ownerUser.split(".").slice(-1)[0]
        : "";
      if (!projectRef) {
        throw new Error(
          "app-role: cannot derive the project ref from SUPABASE_DB_URL's user.",
        );
      }
      appUrl.username = `${ROLE}.${projectRef}`;
      appUrl.password = password;
      appUrl.port = TRANSACTION_PORT;
      // pg 8.23 treats `require` as `verify-full`, which fails on Supavisor's
      // self-signed chain; `no-verify` keeps the connection encrypted without CA
      // verification, the trust level Supabase's own strings intend.
      appUrl.searchParams.set("sslmode", "no-verify");
    }

    const envKey = LOCAL ? "DATABASE_URL_APP" : "SUPABASE_DB_URL_APP";
    const envPath = resolve(process.cwd(), ".env.local");
    const contents = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
    writeFileSync(envPath, setEnvValue(contents, envKey, appUrl.toString()));

    const shown = new URL(appUrl);
    shown.password = "***";
    console.log(`app-role: wrote ${envKey} to .env.local`);
    console.log(`app-role: target ${shown.host} user=${shown.username}`);
  } finally {
    await owner.end();
  }
}

main().catch((error: unknown) => {
  console.error("app-role: failed");
  console.error(error);
  process.exitCode = 1;
});
