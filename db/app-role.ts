import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { hostedOwnerUrl, hostedSsl, loadEnv } from "./env";

/**
 * Create (or rotate) the login role the application connects as, and record its
 * connection string in `.env.local`.
 *
 * The role must not be able to bypass RLS: the owner role can, which is why the
 * application never uses it. Request code connects as `app_user`, then runs
 * `SET LOCAL ROLE authenticated` inside its transaction, so the policies apply
 * and the identity cannot leak between tenants through a pooled connection.
 *
 * Idempotent: safe to re-run. A re-run rotates the password and rewrites the
 * local environment variables, so restart `next dev` afterwards.
 *
 * Usage: `npm run db:app-role`
 */
const ROLE = "app_user";
const TRANSACTION_PORT = "6543";

function setEnvValue(contents: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(contents)) return contents.replace(pattern, line);
  return `${contents.replace(/\s*$/, "")}\n${line}\n`;
}

async function main(): Promise<void> {
  loadEnv();
  const ownerUrl = hostedOwnerUrl();

  const owner = new Client({
    connectionString: ownerUrl,
    ssl: hostedSsl(),
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

    // Same host, application username `app_user.[ref]`, transaction pooler.
    const appUrl = new URL(ownerUrl);
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
    // self-signed chain. `no-verify` keeps the connection encrypted without CA
    // verification, the trust level Supabase's own strings intend.
    appUrl.searchParams.set("sslmode", "no-verify");

    const envPath = resolve(process.cwd(), ".env.local");
    const contents = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
    const next = setEnvValue(
      setEnvValue(contents, "DATABASE_URL_APP", appUrl.toString()),
      "SUPABASE_DB_URL_APP",
      appUrl.toString(),
    );
    writeFileSync(envPath, next);

    const shown = new URL(appUrl);
    shown.password = "***";
    console.log(`app-role: wrote DATABASE_URL_APP to .env.local`);
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
