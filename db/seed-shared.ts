import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import * as schema from "./schema";
import {
  DEMO_BUSINESSES,
  DEMO_ORDERS,
  demoProductSku,
  type DemoCatalogue,
} from "./seed-demo";

/**
 * Catalogue, order, and count helpers shared by `db:seed` (local fixtures)
 * and `db/seed-hosted.ts` (Supabase Auth identity). The SQL here is the demo
 * baseline: change it once and both seeds stay identical. The only deliberate
 * difference between the seeds is *who* rows are attributed to — passed in as
 * `createdBy` because local fixtures do not exist in hosted `auth.users`.
 */

/**
 * Seed one business's catalogue. Runs as the owner connection, which is the
 * only role allowed to write opening movements: the application role can read
 * the ledger but never insert into it directly.
 */
export async function seedDemoCatalogue(
  pool: Pool,
  catalogue: DemoCatalogue,
  createdBy: string,
): Promise<void> {
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
    const sku = demoProductSku(catalogue.skuPrefix, index);

    const supplierName = catalogue.supplierByCategory[category];
    const supplierId = supplierName
      ? (supplierIds.get(supplierName.toLowerCase()) ?? null)
      : null;
    const saved = await pool.query<{ id: string }>(
      `insert into products
         (business_id, name, sku, category_id, unit_of_measure,
          cost_price, selling_price, reorder_level)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (business_id, sku) do update
         set name = excluded.name,
             category_id = excluded.category_id,
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
        unit,
        cost.toFixed(2),
        price === null ? null : price.toFixed(2),
        String(reorder),
      ],
    );

    if (supplierId !== null) {
      // A re-seed can move a product to another category and supplier. The old
      // supplier stays linked as an alternate; the new one becomes the default.
      await pool.query(
        `update product_suppliers set is_default = false, updated_at = now()
          where business_id = $1 and product_id = $2
            and supplier_id <> $3 and is_default`,
        [catalogue.businessId, saved.rows[0].id, supplierId],
      );
      await pool.query(
        `insert into product_suppliers
           (business_id, product_id, supplier_id, is_default, is_active)
         values ($1, $2, $3, true, true)
         on conflict (business_id, product_id, supplier_id) do update
           set is_default = true, is_active = true, updated_at = now()`,
        [catalogue.businessId, saved.rows[0].id, supplierId],
      );
    }

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
        [catalogue.businessId, saved.rows[0].id, String(onHand), createdBy],
      );
    }
  }
}

/**
 * The demonstration orders: one ordered with three produce lines, one draft
 * with two dairy lines.
 *
 * Each order is guarded on its number and on the supplier's open order,
 * because the database allows only one open order per supplier: a database
 * used for a while before re-seeding must not fail, and a second run must add
 * nothing.
 */
export async function seedDemoPurchaseOrders(pool: Pool): Promise<void> {
  const businessId = DEMO_BUSINESSES[0].id;

  for (const order of DEMO_ORDERS) {
    const saved = await pool.query<{ id: string }>(
      `insert into purchase_orders
         (business_id, supplier_id, order_number, status, ordered_at,
          expected_delivery_at, notes)
       select $1, s.id, $2, $3::text,
              case
                when $4::int is null then null
                else now() - ($4::int || ' days')::interval
              end,
              case
                when $5::int is null then null
                else current_date + $5::int
              end,
              $6
         from suppliers s
        where s.business_id = $1 and s.name = $7
          and not exists (
            select 1 from purchase_orders po
             where po.business_id = $1 and po.order_number = $2
          )
          and not exists (
            select 1 from purchase_orders po
             where po.business_id = $1 and po.supplier_id = s.id
               and po.status in ('draft', 'ordered', 'partially_received')
          )
       returning id`,
      [
        businessId,
        order.orderNumber,
        order.status,
        order.orderedDaysAgo,
        order.expectedInDays,
        order.notes,
        order.supplierName,
      ],
    );

    if (!saved.rows[0]) continue;

    await pool.query(
      `insert into purchase_order_lines
         (business_id, purchase_order_id, product_id, quantity_ordered,
          unit_cost)
       select $1, $2, p.id, x.quantity, p.cost_price
         from jsonb_to_recordset($3::jsonb) as x(sku text, quantity numeric)
         join products p on p.business_id = $1 and p.sku = x.sku`,
      [businessId, saved.rows[0].id, JSON.stringify(order.lines)],
    );
  }
}

export interface SeedCounts {
  businesses: number;
  members: number;
  products: number;
  movements: number;
  orders: number;
}

/** Row counts for the "(idempotent)" summary each seed prints. */
export async function countSeedRows(
  db: NodePgDatabase<typeof schema>,
): Promise<SeedCounts> {
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
  return { businesses, members, products, movements, orders };
}
