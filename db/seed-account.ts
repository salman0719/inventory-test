import { Pool } from "pg";
import { databaseUrl, hostedOwnerUrl, hostedSsl } from "./env";
import { buildResetPayload, type DemoBusinessType } from "./seed-demo";

/**
 * Seed the demo baseline into an existing business.
 *
 * This is deliberately not an in-app control. It is an operator command with a
 * dry run, an exact business UUID, an exact business-name confirmation and an
 * explicit --replace for a business that already holds data. It never creates a
 * business, user or membership; the target must already exist with an owner.
 *
 * The actual write is `private.reset_demo_business`, the same function the old
 * Settings panel called. Keeping one implementation means the CLI and a fresh
 * `db:seed` cannot drift. The CLI supplies an owner's claims so the function's
 * membership and owner checks still run.
 *
 * Usage:
 *   npm run db:seed:account -- --business <uuid>
 *   npm run db:seed:account -- --business <uuid> --dataset cafe --replace \
 *     --apply --confirm "REPLACE Demo Cafe"
 *
 * Hosted databases require --hosted. Production environments require
 * --production and ALLOW_PRODUCTION_DEMO_SEED=1.
 */

const USAGE = `Usage:
  npm run db:seed:account -- --business <uuid> [options]

Required:
  --business <uuid>       Existing business to seed. Never a name or email.

Options:
  --dataset cafe|retail   Demo catalogue. Defaults to the business type.
  --replace               Allow writing over a business that already has data.
                          Without it, a non-empty business is refused.
  --apply                 Actually write. Without it, only a dry run is printed.
  --confirm "<phrase>"    Must be exactly "SEED <business name>" for an empty
                          business, or "REPLACE <business name>" when replacing.
  --hosted                Use SUPABASE_DB_URL (session pooler) instead of the
                          local DATABASE_URL.
  --production            Acknowledge a production environment. Also requires
                          ALLOW_PRODUCTION_DEMO_SEED=1.
  --help                  Print this message.

Safety:
  - The business must already exist and have an owner; this script never
    creates businesses or users.
  - It never writes unless --apply and the exact --confirm phrase are present.
  - A non-empty business is refused unless --replace is also present.
  - Local and hosted targets are explicit; a non-loopback DATABASE_URL is
    refused unless --hosted is passed.
  - The write is one transaction; a failure rolls back.
`;

type Args = {
  business?: string;
  dataset?: string;
  replace: boolean;
  apply: boolean;
  confirm?: string;
  hosted: boolean;
  production: boolean;
};

function readArgs(argv: string[]): Args | null {
  const args: Args = {
    replace: false,
    apply: false,
    hosted: false,
    production: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") return null;
    if (arg === "--replace") {
      args.replace = true;
      continue;
    }
    if (arg === "--apply") {
      args.apply = true;
      continue;
    }
    if (arg === "--hosted") {
      args.hosted = true;
      continue;
    }
    if (arg === "--production") {
      args.production = true;
      continue;
    }
    if (["--business", "--dataset", "--confirm"].includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} needs a value.\n\n${USAGE}`);
      }
      index += 1;
      if (arg === "--business") args.business = value;
      if (arg === "--dataset") args.dataset = value;
      if (arg === "--confirm") args.confirm = value;
      continue;
    }
    throw new Error(`Unknown argument ${arg}.\n\n${USAGE}`);
  }

  return args;
}

type Target = {
  id: string;
  name: string;
  business_type: string;
  currency_code: string;
  owner_id: string | null;
  owner_email: string | null;
};

type Counts = {
  products: number;
  categories: number;
  suppliers: number;
  orders: number;
  movements: number;
  receipts: number;
  stocktakes: number;
  imports: number;
  activity: number;
};

function countText(counts: Counts): string {
  return [
    `${counts.products} products`,
    `${counts.categories} categories`,
    `${counts.suppliers} suppliers`,
    `${counts.orders} orders`,
    `${counts.movements} movements`,
    `${counts.receipts} receipts`,
    `${counts.stocktakes} stocktakes`,
    `${counts.imports} imports`,
    `${counts.activity} activity events`,
  ].join(", ");
}

async function main(): Promise<void> {
  const args = readArgs(process.argv.slice(2));
  if (args === null) {
    console.log(USAGE);
    return;
  }

  if (!args.business) {
    throw new Error(`--business is required.\n\n${USAGE}`);
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      args.business,
    )
  ) {
    throw new Error(
      "--business must be the target's UUID, not a name or email address.",
    );
  }

  const productionEnvironment =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production";

  if (productionEnvironment && !args.production) {
    throw new Error(
      "Production environment detected. Refusing without --production and ALLOW_PRODUCTION_DEMO_SEED=1.",
    );
  }
  if (args.production && process.env.ALLOW_PRODUCTION_DEMO_SEED !== "1") {
    throw new Error(
      "Refusing --production unless ALLOW_PRODUCTION_DEMO_SEED=1 is set.",
    );
  }

  const url = args.hosted ? hostedOwnerUrl() : databaseUrl();
  const host = new URL(url).hostname;
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(host);

  if (args.hosted && loopback) {
    throw new Error(
      "--hosted was passed but the configured URL is loopback. Use the local script for local data.",
    );
  }
  if (!args.hosted && !loopback) {
    throw new Error(
      `Refusing a non-loopback database (${host}) without --hosted. Use --hosted for Supabase.`,
    );
  }

  if (args.dataset && args.dataset !== "cafe" && args.dataset !== "retail") {
    throw new Error("--dataset must be cafe or retail.");
  }

  const pool = new Pool({
    connectionString: url,
    max: 1,
    ssl: args.hosted ? hostedSsl() : undefined,
  });

  const client = await pool.connect();
  try {
    const targetResult = await client.query<Target>(
      `select
         b.id,
         b.name,
         b.business_type,
         b.currency_code,
         (select m.user_id
            from business_members m
           where m.business_id = b.id and m.role = 'owner'
           order by m.created_at, m.user_id
           limit 1) as owner_id,
         (select u.email
            from business_members m
            join auth.users u on u.id = m.user_id
           where m.business_id = b.id and m.role = 'owner'
           order by m.created_at, m.user_id
           limit 1) as owner_email
       from businesses b
       where b.id = $1`,
      [args.business],
    );

    const target = targetResult.rows[0];
    if (!target) {
      throw new Error(`No business with id ${args.business}.`);
    }
    if (!target.owner_id) {
      throw new Error(
        `Business ${target.name} has no owner. This script does not guess one.`,
      );
    }

    const countsResult = await client.query<Counts>(
      `select
         (select count(*)::int from products where business_id = $1) as products,
         (select count(*)::int from categories where business_id = $1) as categories,
         (select count(*)::int from suppliers where business_id = $1) as suppliers,
         (select count(*)::int from purchase_orders where business_id = $1) as orders,
         (select count(*)::int from stock_movements where business_id = $1) as movements,
         (select count(*)::int from purchase_receipts where business_id = $1) as receipts,
         (select count(*)::int from stocktake_sessions where business_id = $1) as stocktakes,
         (select count(*)::int from csv_imports where business_id = $1) as imports,
         (select count(*)::int from activity_log where business_id = $1) as activity`,
      [target.id],
    );

    const counts = countsResult.rows[0] ?? {
      products: 0,
      categories: 0,
      suppliers: 0,
      orders: 0,
      movements: 0,
      receipts: 0,
      stocktakes: 0,
      imports: 0,
      activity: 0,
    };
    const hasData = Object.values(counts).some((value) => value > 0);

    const dataset =
      (args.dataset as DemoBusinessType | undefined) ??
      (target.business_type === "cafe" || target.business_type === "retail"
        ? (target.business_type as DemoBusinessType)
        : undefined);

    if (!dataset) {
      throw new Error(
        `Business ${target.name} is type "${target.business_type}"; pass --dataset cafe or --dataset retail explicitly.`,
      );
    }

    const phrase = hasData ? `REPLACE ${target.name}` : `SEED ${target.name}`;

    console.log("seed-account: target");
    console.log(`  business: ${target.name} (${target.id})`);
    console.log(
      `  type: ${target.business_type} · currency ${target.currency_code}`,
    );
    console.log(`  owner: ${target.owner_email ?? target.owner_id}`);
    console.log(`  current data: ${countText(counts)}`);
    console.log(`  dataset: ${dataset}`);
    console.log(
      `  action: ${hasData ? "replace" : "seed into empty business"}`,
    );
    console.log(`  confirmation phrase: ${JSON.stringify(phrase)}`);

    if (hasData && !args.replace) {
      throw new Error(
        `Business ${target.name} already holds data. Re-run with --replace to intentionally replace it. Nothing was written.`,
      );
    }

    if (!args.apply) {
      console.log(
        "\nseed-account: dry run — nothing was written. Add --apply and the exact --confirm phrase to proceed.",
      );
      return;
    }

    if (args.confirm !== phrase) {
      throw new Error(
        `Confirmation did not match. Pass --confirm ${JSON.stringify(phrase)}. Nothing was written.`,
      );
    }

    const payload = buildResetPayload(dataset);

    await client.query("begin");
    try {
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: target.owner_id, role: "authenticated" }),
      ]);
      const reset = await client.query<{ reset: Record<string, number> }>(
        "select private.reset_demo_business($1, $2::jsonb) as reset",
        [target.id, JSON.stringify(payload)],
      );
      await client.query("commit");

      const result = reset.rows[0]?.reset;
      console.log(
        `seed-account: ok — ${target.name} now holds ${result?.products ?? 0} products, ${result?.suppliers ?? 0} suppliers, ${result?.categories ?? 0} categories, ${result?.movements ?? 0} opening movements and ${result?.orders ?? 0} orders.`,
      );
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    "seed-account: failed —",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
