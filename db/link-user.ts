import { Client } from "pg";
import { z } from "zod";
import { loadEnv } from "./env";

/**
 * Development only: give a real Supabase Auth user access to a demo business in
 * the local database.
 *
 * Supabase Auth owns identity, so the app's user ids come from Supabase. The local
 * compose database is seeded with three fixed ids that exist nowhere else. To sign
 * in locally against seeded data, this inserts the Supabase user's id into the
 * local `auth.users` shim and adds an owner membership.
 *
 * It refuses anything that is not a loopback database, so it cannot touch a hosted
 * project. It is not authentication: it grants no password and sets no session.
 *
 * Usage: `npm run db:link-user -- <user-uuid> <email> [cafe|retail]`
 */
const input = z.object({
  userId: z.uuid(
    "Pass the user's UUID from Supabase Auth as the first argument.",
  ),
  email: z.email("Pass the user's email as the second argument."),
  demo: z.enum(["cafe", "retail"]).default("cafe"),
});

async function main(): Promise<void> {
  loadEnv();

  const parsed = input.safeParse({
    userId: process.argv[2],
    email: process.argv[3],
    demo: process.argv[4] ?? "cafe",
  });
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues.map((issue) => issue.message).join(" "),
    );
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");

  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) {
    throw new Error(
      `link-user: refusing to write to a non-local database (${host}).`,
    );
  }

  const businessId =
    parsed.data.demo === "cafe"
      ? "11111111-1111-1111-1111-111111111111"
      : "22222222-2222-2222-2222-222222222222";

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into auth.users (id, email) values ($1, $2)
       on conflict (id) do update set email = excluded.email`,
      [parsed.data.userId, parsed.data.email],
    );
    await client.query(
      `insert into business_members (business_id, user_id, role)
       values ($1, $2, 'owner')
       on conflict (business_id, user_id) do update set role = excluded.role`,
      [businessId, parsed.data.userId],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }

  console.log(
    `link-user: ${parsed.data.email} (${parsed.data.userId}) is now an owner of ${parsed.data.demo}`,
  );
  console.log(
    "link-user: sign in with that account; the selector will list that business only.",
  );
}

main().catch((error: unknown) => {
  console.error("link-user: failed");
  console.error(error);
  process.exitCode = 1;
});
