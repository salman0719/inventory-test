import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { databaseUrl, needsAuthShim } from "./env";
import * as schema from "./schema";

/**
 * Idempotent demo seed: two businesses, three demo users, their memberships.
 *
 * Deliberately no catalogue rows. Products, suppliers and purchase orders are
 * seeded in Phase 5 alongside the UI that reads them, so this runner proves the
 * seed process without inventing half a dataset.
 *
 * Development and CI only: it writes to auth.users, which Supabase owns. A hosted
 * database is rejected until Phase 5 adds a Supabase Auth seeding path.
 */
const DEMO_BUSINESSES = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Demo Cafe",
    businessType: "cafe",
    currencyCode: "AUD",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Demo Retail",
    businessType: "retail",
    currencyCode: "AUD",
  },
] as const;

const DEMO_USERS = [
  { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", email: "owner@cafe.test" },
  { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", email: "owner@retail.test" },
  { id: "cccccccc-cccc-cccc-cccc-cccccccccccc", email: "staff@cafe.test" },
] as const;

const DEMO_MEMBERSHIPS = [
  {
    businessId: DEMO_BUSINESSES[0].id,
    userId: DEMO_USERS[0].id,
    role: "owner",
  },
  {
    businessId: DEMO_BUSINESSES[1].id,
    userId: DEMO_USERS[1].id,
    role: "owner",
  },
  {
    businessId: DEMO_BUSINESSES[0].id,
    userId: DEMO_USERS[2].id,
    role: "staff",
  },
] as const;

async function main(): Promise<void> {
  const url = databaseUrl();
  if (!needsAuthShim(url)) {
    throw new Error(
      "seed: refusing to write demo users to a hosted database. " +
        "Supabase Auth owns auth.users; hosted seeding arrives with Phase 5.",
    );
  }

  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool, { schema });

  try {
    for (const business of DEMO_BUSINESSES) {
      await db
        .insert(schema.businesses)
        .values(business)
        .onConflictDoUpdate({
          target: schema.businesses.id,
          set: { name: business.name, businessType: business.businessType },
        });
    }

    for (const user of DEMO_USERS) {
      await pool.query(
        `insert into auth.users (id, email) values ($1, $2)
         on conflict (id) do update set email = excluded.email`,
        [user.id, user.email],
      );
    }

    for (const membership of DEMO_MEMBERSHIPS) {
      await db
        .insert(schema.businessMembers)
        .values(membership)
        .onConflictDoUpdate({
          target: [
            schema.businessMembers.businessId,
            schema.businessMembers.userId,
          ],
          set: { role: membership.role },
        });
    }

    const [{ businesses }] = await db
      .select({ businesses: sql<number>`count(*)::int` })
      .from(schema.businesses);
    const [{ members }] = await db
      .select({ members: sql<number>`count(*)::int` })
      .from(schema.businessMembers);

    console.log(
      `seed: ok — ${businesses} businesses, ${DEMO_USERS.length} demo users, ${members} memberships (idempotent)`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    "seed: failed —",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
