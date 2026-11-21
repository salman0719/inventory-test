import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { databaseUrl, hostedOwnerUrl, hostedSsl, needsAuthShim } from "./env";

/**
 * Apply committed migrations from db/migrations in order, exactly once.
 *
 * `--require-migrations` makes an empty run a failure, so CI cannot pass without
 * a migration having been applied. Local development may run this repeatedly.
 *
 * The development auth shim runs first: the schema references auth.users, which
 * exists on Supabase but not on compose or the CI service.
 *
 * `--hosted` applies the same migrations to Supabase using SUPABASE_DB_URL (owner
 * role, session pooler), so the local compose database stays the working one.
 */
const REQUIRE_MIGRATIONS = process.argv.includes("--require-migrations");
const HOSTED = process.argv.includes("--hosted");
const SHIM_FILE = new URL("./dev/0001-auth-shim.sql", import.meta.url);

async function appliedCount(pool: Pool): Promise<number> {
  const table = await pool.query<{ exists: boolean }>(
    "select to_regclass('drizzle.__drizzle_migrations') is not null as exists",
  );
  if (!table.rows[0]?.exists) return 0;
  const count = await pool.query<{ n: number }>(
    "select count(*)::int as n from drizzle.__drizzle_migrations",
  );
  return count.rows[0]?.n ?? 0;
}

async function main(): Promise<void> {
  const url = HOSTED ? hostedOwnerUrl() : databaseUrl();
  const shim = needsAuthShim(url);
  const pool = new Pool({
    connectionString: url,
    max: 1,
    ssl: HOSTED ? hostedSsl() : undefined,
  });

  try {
    if (shim) {
      await pool.query(readFileSync(SHIM_FILE, "utf8"));
      console.log(
        "migrate: development auth shim ensured (auth.uid from request.jwt.claims)",
      );
    } else {
      console.log("migrate: hosted database, development auth shim skipped");
    }

    const before = await appliedCount(pool);
    await migrate(drizzle(pool), { migrationsFolder: "db/migrations" });
    const after = await appliedCount(pool);
    const applied = after - before;

    console.log(
      `migrate: applied ${applied} migration(s), ${after} tracked in total`,
    );

    if (REQUIRE_MIGRATIONS && applied === 0) {
      console.error(
        "migrate: --require-migrations was set but nothing was applied. " +
          "The migrations folder is empty, or this database is already current.",
      );
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  // Print the cause chain: Drizzle and pg both wrap the useful message.
  console.error("migrate: failed");
  console.error(error);
  process.exitCode = 1;
});
