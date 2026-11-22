import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { databaseUrl, needsAuthShim } from "./env";
import * as schema from "./schema";
import { CATALOGUES, DEMO_BUSINESSES } from "./seed-demo";
import {
  countSeedRows,
  seedDemoCatalogue,
  seedDemoPurchaseOrders,
} from "./seed-shared";

/**
 * Idempotent demo seed: two businesses, three demo users, their memberships,
 * fictional suppliers, the catalogue (60 cafe ingredients, 160 retail lines) and
 * opening stock.
 *
 * Products upsert on (business_id, sku), so re-running updates rather than
 * duplicates. Opening balances are written as `opening` stock movements, one per
 * product, guarded so a second run adds none: stock is always the ledger's sum.
 * Two cafe purchase orders demonstrate the receiving flow; the retail store stays
 * empty, which is a valid first state for a new business.
 *
 * Development and CI only: it writes to auth.users, which Supabase owns. A hosted
 * database is rejected; `db:seed:hosted` loads the same baseline there.
 */
/**
 * Reserved `.invalid` addresses (RFC 2606), deliberately unusable as real
 * accounts. `email` is unique in both this shim and Supabase Auth, so fixtures
 * that borrowed a real-looking address made `db:link-user` fail for anyone who
 * had registered that address in Supabase.
 */
const DEMO_USERS = [
  {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    email: "owner@demo-cafe.invalid",
  },
  {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    email: "owner@demo-retail.invalid",
  },
  {
    id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    email: "staff@demo-cafe.invalid",
  },
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
        "Supabase Auth owns auth.users; use `db:seed:hosted` there.",
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

    for (const catalogue of CATALOGUES) {
      await seedDemoCatalogue(pool, catalogue, catalogue.ownerId);
    }

    await seedDemoPurchaseOrders(pool);

    const counts = await countSeedRows(db);

    console.log(
      `seed: ok — ${counts.businesses} businesses, ${DEMO_USERS.length} demo users, ${counts.members} memberships, ${counts.products} products, ${counts.movements} opening movements, ${counts.orders} purchase orders (idempotent)`,
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
