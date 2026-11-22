import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { databaseUrl, needsAuthShim } from "./env";
import * as schema from "./schema";
import {
  CAFE_CATEGORIES,
  CAFE_PRODUCTS,
  CAFE_SUPPLIER_BY_CATEGORY,
  CAFE_SUPPLIERS,
  RETAIL_CATEGORIES,
  RETAIL_PRODUCTS,
  RETAIL_SUPPLIER_BY_CATEGORY,
  RETAIL_SUPPLIERS,
  type SeedProduct,
  type SeedSupplier,
} from "./seed-catalogue";

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

/** Each business's catalogue, with the owner who signs the opening balances. */
const CATALOGUES: ReadonlyArray<{
  businessId: string;
  skuPrefix: string;
  categories: readonly string[];
  products: SeedProduct[];
  suppliers: SeedSupplier[];
  supplierByCategory: Record<string, string>;
  ownerId: string;
}> = [
  {
    businessId: DEMO_BUSINESSES[0].id,
    skuPrefix: "CAF",
    categories: CAFE_CATEGORIES,
    products: CAFE_PRODUCTS,
    suppliers: CAFE_SUPPLIERS,
    supplierByCategory: CAFE_SUPPLIER_BY_CATEGORY,
    ownerId: DEMO_USERS[0].id,
  },
  {
    businessId: DEMO_BUSINESSES[1].id,
    skuPrefix: "RET",
    categories: RETAIL_CATEGORIES,
    products: RETAIL_PRODUCTS,
    suppliers: RETAIL_SUPPLIERS,
    supplierByCategory: RETAIL_SUPPLIER_BY_CATEGORY,
    ownerId: DEMO_USERS[1].id,
  },
];

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

/**
 * Seed one business's catalogue. Runs as the owner connection, which is the only
 * role allowed to write opening movements: the application role can read the
 * ledger but never insert into it directly.
 */
async function seedCatalogue(
  pool: Pool,
  catalogue: (typeof CATALOGUES)[number],
) {
  for (const name of catalogue.categories) {
    await pool.query(
      `insert into categories (business_id, name)
       select $1, $2
        where not exists (
          select 1 from categories
           where business_id = $1 and lower(name) = lower($2)
        )`,
      [catalogue.businessId, name],
    );
  }

  for (const supplier of catalogue.suppliers) {
    await pool.query(
      `insert into suppliers
         (business_id, name, contact_name, email, phone, address, notes)
       select $1, $2, $3, $4, $5, $6, $7
        where not exists (
          select 1 from suppliers
           where business_id = $1 and lower(name) = lower($2)
        )`,
      [
        catalogue.businessId,
        supplier.name,
        supplier.contactName,
        supplier.email,
        supplier.phone,
        supplier.address,
        supplier.notes,
      ],
    );
  }

  const stored = await pool.query<{ id: string; name: string }>(
    "select id, name from categories where business_id = $1",
    [catalogue.businessId],
  );
  const categoryIds = new Map(
    stored.rows.map((row) => [row.name.toLowerCase(), row.id]),
  );

  const storedSuppliers = await pool.query<{ id: string; name: string }>(
    "select id, name from suppliers where business_id = $1",
    [catalogue.businessId],
  );
  const supplierIds = new Map(
    storedSuppliers.rows.map((row) => [row.name.toLowerCase(), row.id]),
  );

  for (const [index, product] of catalogue.products.entries()) {
    const [name, category, unit, cost, price, reorder, onHand] = product;
    const sku = `${catalogue.skuPrefix}-${String(index + 1).padStart(3, "0")}`;

    const supplierName = catalogue.supplierByCategory[category];
    const saved = await pool.query<{ id: string }>(
      `insert into products
         (business_id, name, sku, category_id, supplier_id, unit_of_measure,
          cost_price, selling_price, reorder_level)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (business_id, sku) do update
         set name = excluded.name,
             category_id = excluded.category_id,
             supplier_id = excluded.supplier_id,
             unit_of_measure = excluded.unit_of_measure,
             cost_price = excluded.cost_price,
             selling_price = excluded.selling_price,
             reorder_level = excluded.reorder_level,
             updated_at = now()
       returning id`,
      [
        catalogue.businessId,
        name,
        sku,
        categoryIds.get(category.toLowerCase()) ?? null,
        supplierName
          ? (supplierIds.get(supplierName.toLowerCase()) ?? null)
          : null,
        unit,
        cost.toFixed(2),
        price === null ? null : price.toFixed(2),
        String(reorder),
      ],
    );

    if (onHand > 0) {
      await pool.query(
        `insert into stock_movements
           (business_id, product_id, movement_type, quantity_delta, reason,
            created_by)
         select $1, $2, 'opening', $3::numeric, 'Opening balance', $4
          where not exists (
            select 1 from stock_movements
             where business_id = $1 and product_id = $2
               and movement_type = 'opening'
          )`,
        [
          catalogue.businessId,
          saved.rows[0].id,
          String(onHand),
          catalogue.ownerId,
        ],
      );
    }
  }
}

/**
 * One ordered and one draft purchase order for the cafe.
 *
 * Guarded on both the order number and the supplier's open order, because the
 * database allows only one open order per supplier: a database used for a while
 * before re-seeding must not fail, and a second run must add nothing.
 */
async function seedPurchaseOrders(pool: Pool): Promise<void> {
  const businessId = DEMO_BUSINESSES[0].id;

  const ordered = await pool.query<{ id: string }>(
    `insert into purchase_orders
       (business_id, supplier_id, order_number, status, ordered_at,
        expected_delivery_at, notes)
     select $1, s.id, 'PO-0001', 'ordered', now() - interval '2 days',
            current_date + 3,
            'Weekly produce order. Check the tomatoes before signing.'
       from suppliers s
      where s.business_id = $1 and s.name = 'Fresh Fields Produce'
        and not exists (
          select 1 from purchase_orders po
           where po.business_id = $1 and po.order_number = 'PO-0001'
        )
        and not exists (
          select 1 from purchase_orders po
           where po.business_id = $1 and po.supplier_id = s.id
             and po.status in ('draft', 'ordered', 'partially_received')
        )
     returning id`,
    [businessId],
  );

  if (ordered.rows[0]) {
    await pool.query(
      `insert into purchase_order_lines
         (business_id, purchase_order_id, product_id, quantity_ordered, unit_cost)
       select $1, $2, p.id, v.quantity, p.cost_price
         from (values ('CAF-001', 12::numeric), ('CAF-004', 20::numeric),
                      ('CAF-011', 3::numeric)) as v(sku, quantity)
         join products p on p.business_id = $1 and p.sku = v.sku`,
      [businessId, ordered.rows[0].id],
    );
  }

  const draft = await pool.query<{ id: string }>(
    `insert into purchase_orders
       (business_id, supplier_id, order_number, expected_delivery_at, notes)
     select $1, s.id, 'PO-0002', current_date + 5, 'Standing dairy order.'
       from suppliers s
      where s.business_id = $1 and s.name = 'Coldstream Dairy'
        and not exists (
          select 1 from purchase_orders po
           where po.business_id = $1 and po.order_number = 'PO-0002'
        )
        and not exists (
          select 1 from purchase_orders po
           where po.business_id = $1 and po.supplier_id = s.id
             and po.status in ('draft', 'ordered', 'partially_received')
        )
     returning id`,
    [businessId],
  );

  if (draft.rows[0]) {
    await pool.query(
      `insert into purchase_order_lines
         (business_id, purchase_order_id, product_id, quantity_ordered, unit_cost)
       select $1, $2, p.id, v.quantity, p.cost_price
         from (values ('CAF-021', 24::numeric), ('CAF-022', 6::numeric)) as v(sku, quantity)
         join products p on p.business_id = $1 and p.sku = v.sku`,
      [businessId, draft.rows[0].id],
    );
  }
}

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

    for (const catalogue of CATALOGUES) {
      await seedCatalogue(pool, catalogue);
    }

    await seedPurchaseOrders(pool);

    const [{ businesses }] = await db
      .select({ businesses: sql<number>`count(*)::int` })
      .from(schema.businesses);
    const [{ members }] = await db
      .select({ members: sql<number>`count(*)::int` })
      .from(schema.businessMembers);
    const [{ products }] = await db
      .select({ products: sql<number>`count(*)::int` })
      .from(schema.products);
    const [{ movements }] = await db
      .select({ movements: sql<number>`count(*)::int` })
      .from(schema.stockMovements);
    const [{ orders }] = await db
      .select({ orders: sql<number>`count(*)::int` })
      .from(schema.purchaseOrders);

    console.log(
      `seed: ok — ${businesses} businesses, ${DEMO_USERS.length} demo users, ${members} memberships, ${products} products, ${movements} opening movements, ${orders} purchase orders (idempotent)`,
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
