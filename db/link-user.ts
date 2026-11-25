import { Client } from "pg";
import { z } from "zod";
import { localDatabaseUrl, writeAuthIdentity } from "../src/lib/auth-shim";
import { fetchHostedIdentities } from "./hosted-auth";

/**
 * Development only: give a real Supabase Auth user access to a demo business in
 * the local database.
 *
 * Supabase Auth owns identity, so the app's user ids come from Supabase and the local
 * compose database keeps them in the `auth.users` shim. A linked account used to be
 * written as `(id, email)` and nothing else, which left `email_confirmed_at` empty and
 * `created_at` at the moment of the link — the panel then described a working account
 * as unconfirmed and newly joined. The four identity fields are now copied from the
 * hosted row, so the local copy is the truth rather than a guess. The hosted row is
 * read over `SUPABASE_DB_URL`; nothing here writes to the hosted project.
 *
 * It refuses anything that is not a loopback database, so it cannot touch a hosted
 * project. It is not authentication: it grants no password and sets no session.
 *
 * By default the user joins both demo businesses, so the business selector can
 * be demonstrated without hand-written SQL. Pass `cafe` or `retail` to link one.
 *
 * Usage: `npm run db:link-user -- <user-uuid> <email> [cafe|retail|both]`
 */
const input = z.object({
  userId: z.uuid(
    "Pass the user's UUID from Supabase Auth as the first argument.",
  ),
  email: z.email("Pass the user's email as the second argument."),
  demo: z.enum(["cafe", "retail", "both"]).default("both"),
});

const BUSINESS_IDS = {
  cafe: "11111111-1111-1111-1111-111111111111",
  retail: "22222222-2222-2222-2222-222222222222",
} as const;

async function main(): Promise<void> {
  const parsed = input.safeParse({
    userId: process.argv[2],
    email: process.argv[3],
    demo: process.argv[4] ?? "both",
  });
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues.map((issue) => issue.message).join(" "),
    );
  }

  const [identity] = await fetchHostedIdentities(parsed.data.userId);
  if (!identity) {
    throw new Error(
      `no hosted auth.users row for ${parsed.data.userId}. ` +
        "Check SUPABASE_DB_URL, and that the account has confirmed its address.",
    );
  }

  const claimed = parsed.data.email.trim().toLowerCase();
  if (identity.email !== claimed) {
    console.warn(
      `link-user: hosted address is ${identity.email}; using it instead of ${claimed}`,
    );
  }

  const demos =
    parsed.data.demo === "both"
      ? (["cafe", "retail"] as const)
      : ([parsed.data.demo] as const);

  const client = new Client({ connectionString: localDatabaseUrl() });
  await client.connect();
  try {
    await client.query("begin");
    await writeAuthIdentity(client, identity);
    for (const demo of demos) {
      await client.query(
        `insert into business_members (business_id, user_id, role)
         values ($1, $2, 'owner')
         on conflict (business_id, user_id) do update set role = excluded.role`,
        [BUSINESS_IDS[demo], identity.id],
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
    `link-user: ${identity.email} (${identity.id}) — ${
      identity.emailConfirmedAt
        ? `confirmed ${identity.emailConfirmedAt.toISOString()}`
        : "not confirmed"
    }, joined ${identity.createdAt.toISOString()}`,
  );
  console.log(
    demos.length > 1
      ? `link-user: now an owner of ${demos.join(" and ")}; the selector lists both demo businesses.`
      : `link-user: now an owner of ${demos[0]}; the selector lists that business only.`,
  );
}

main().catch((error: unknown) => {
  console.error("link-user: failed");
  console.error(error);
  process.exitCode = 1;
});
