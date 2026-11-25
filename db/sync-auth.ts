import { Client } from "pg";
import { localDatabaseUrl, writeAuthIdentity } from "../src/lib/auth-shim";
import { fetchHostedIdentities } from "./hosted-auth";

/**
 * Copy accounts from hosted Supabase Auth into the local `auth.users` shim.
 *
 * Local development signs in through hosted GoTrue and reads the local compose
 * database, so the local `auth.users` holds only what was written to it. The
 * confirmation route now writes an account the moment its link is redeemed, which
 * covers every registration made from this machine. This command covers the rest: an
 * account registered elsewhere, one that existed before that write, or a local
 * database that was recreated.
 *
 * That is per-account work, not a schedule — nothing in the shim goes stale with time.
 * Passwords are not part of it: GoTrue keeps them, and the local database never sees
 * one.
 *
 * Usage: `npm run db:sync-auth -- <email|uuid>`, or no argument for every account.
 */
async function main(): Promise<void> {
  const selector = process.argv[2]?.trim();
  const identities = await fetchHostedIdentities(
    selector === "" ? undefined : selector,
  );

  if (identities.length === 0) {
    throw new Error(
      selector
        ? `sync-auth: no hosted auth.users row for ${selector}`
        : "sync-auth: the hosted project has no accounts",
    );
  }

  const client = new Client({ connectionString: localDatabaseUrl() });
  await client.connect();

  let added = 0;
  let updated = 0;
  try {
    await client.query("begin");
    for (const identity of identities) {
      const { inserted } = await writeAuthIdentity(client, identity);
      if (inserted) added += 1;
      else updated += 1;
      console.log(
        `  ${inserted ? "added  " : "updated"} ${identity.email}\n` +
          `          id=${identity.id}\n` +
          `          ${
            identity.emailConfirmedAt
              ? `confirmed ${identity.emailConfirmedAt.toISOString()}`
              : "not confirmed"
          }, joined ${identity.createdAt.toISOString()}`,
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }

  console.log(
    `sync-auth: ${added} added, ${updated} updated, ${identities.length} hosted account(s) read`,
  );
}

main().catch((error: unknown) => {
  console.error("sync-auth: failed");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
