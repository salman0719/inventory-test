import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { z } from "zod";
import { hostedOwnerUrl, hostedSsl } from "./env";
import * as schema from "./schema";
import { CATALOGUES, DEMO_BUSINESSES } from "./seed-demo";
import {
  countSeedRows,
  seedDemoCatalogue,
  seedDemoPurchaseOrders,
} from "./seed-shared";

/**
 * Hosted demo seed: the same Demo Cafe / Demo Retail baseline as `db:seed`,
 * for the Supabase project where Supabase Auth owns identity.
 *
 * Differences from `db:seed` (deliberate, not drift):
 * - Never writes `auth.users`. The Supabase accounts must already exist; their
 *   ids are passed as arguments and verified before anything is written.
 * - Always targets the hosted owner connection (`SUPABASE_DB_URL`). It refuses
 *   loopback databases so it cannot run against compose or CI.
 * - Opening movements are recorded as the linked owner, not a fixture id,
 *   because fixtures do not exist in hosted `auth.users`.
 *
 * Usage:
 * `tsx db/seed-hosted.ts <cafeOwnerUuid> [<retailOwnerUuid>]`
 * One owner for both businesses is the normal demo setup; pass the second id
 * only when the retail business belongs to someone else.
 */

const input = z.object({
  cafeOwnerId: z.uuid(
    "Pass the cafe owner's Supabase Auth UUID as the first argument.",
  ),
  retailOwnerId: z.uuid(
    "Pass the retail owner's Supabase Auth UUID as the second argument.",
  ),
});

const args = input.safeParse({
  cafeOwnerId: process.argv[2],
  retailOwnerId: process.argv[3] ?? process.argv[2],
});

if (!args.success) {
  throw new Error(args.error.issues.map((issue) => issue.message).join(" "));
}

const { cafeOwnerId, retailOwnerId } = args.data;

function ownerFor(businessId: string): string {
  return businessId === DEMO_BUSINESSES[0].id ? cafeOwnerId : retailOwnerId;
}

async function main(): Promise<void> {
  const url = hostedOwnerUrl();

  const host = new URL(url).hostname;
  if (["localhost", "127.0.0.1", "[::1]"].includes(host)) {
    throw new Error(
      "seed-hosted: refusing a loopback database. Use `db:seed` for local data.",
    );
  }

  const pool = new Pool({ connectionString: url, max: 1, ssl: hostedSsl() });
  const db = drizzle(pool, { schema });

  try {
    for (const userId of [cafeOwnerId, retailOwnerId]) {
      const found = await pool.query(
        "select id, email from auth.users where id = $1",
        [userId],
      );
      if (!found.rows[0]) {
        throw new Error(
          `seed-hosted: no Supabase Auth user ${userId}. Sign the account up (or confirm its id) first; this script never creates auth users.`,
        );
      }
      console.log(
        `seed-hosted: auth user ${found.rows[0].email} (${userId}) confirmed.`,
      );
    }

    for (const business of DEMO_BUSINESSES) {
      await db
        .insert(schema.businesses)
        .values(business)
        .onConflictDoUpdate({
          target: schema.businesses.id,
          set: { name: business.name, businessType: business.businessType },
        });
    }

    for (const [businessId, userId] of [
      [DEMO_BUSINESSES[0].id, cafeOwnerId],
      [DEMO_BUSINESSES[1].id, retailOwnerId],
    ] as const) {
      await db
        .insert(schema.businessMembers)
        .values({ businessId, userId, role: "owner" })
        .onConflictDoUpdate({
          target: [
            schema.businessMembers.businessId,
            schema.businessMembers.userId,
          ],
          set: { role: "owner" },
        });
    }

    for (const catalogue of CATALOGUES) {
      await seedDemoCatalogue(pool, catalogue, ownerFor(catalogue.businessId));
    }

    await seedDemoPurchaseOrders(pool);

    const counts = await countSeedRows(db);

    console.log(
      `seed-hosted: ok — ${counts.businesses} businesses, ${counts.members} memberships, ${counts.products} products, ${counts.movements} opening movements, ${counts.orders} purchase orders (idempotent)`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    "seed-hosted: failed —",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
