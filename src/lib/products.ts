import type { PoolClient } from "pg";
import { recordActivity } from "./activity";
import { runInTenant, withTenant } from "./db";
import { parseProductSort, type ProductInput } from "./product-input";

/**
 * Product and category data access.
 *
 * Every function runs inside `withTenant`, so RLS decides which rows exist for the
 * signed-in user. The explicit `business_id = $1` filters are defence in depth, not
 * the security boundary: the id always comes from the session's active business.
 */

export type ProductSummary = {
  id: string;
  name: string;
  sku: string;
  supplierSku: string | null;
  unitOfMeasure: string;
  categoryId: string | null;
  categoryName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  costPrice: string;
  sellingPrice: string | null;
  reorderLevel: string;
  targetStockLevel: string | null;
  onHand: string;
  description: string | null;
  isArchived: boolean;
};

export type CategoryOption = {
  id: string;
  name: string;
  productCount: number;
};

export type SupplierOption = { id: string; name: string };

/** One receipt line, as the product panel reads it: what was paid, when, to whom. */
export type PricePaid = {
  unitCost: string;
  receivedAt: string;
  supplierId: string;
  supplierName: string;
};

export type ProductPriceHistory = {
  /** The most recent receipt, or null when nothing has been received. */
  lastPaid: PricePaid | null;
  /** Up to five receipts, newest first. */
  entries: PricePaid[];
};

export const NO_PRICE_HISTORY: ProductPriceHistory = {
  lastPaid: null,
  entries: [],
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SELECT_PRODUCT = `
  select p.id, p.name, p.sku, p.supplier_sku, p.unit_of_measure, p.category_id,
         c.name as category_name, p.supplier_id, s.name as supplier_name,
         p.cost_price, p.selling_price, p.reorder_level, p.target_stock_level,
         p.description, p.is_archived,
         coalesce(st.on_hand, 0)::text as on_hand
    from products p
    left join categories c on c.business_id = p.business_id and c.id = p.category_id
    left join suppliers s on s.business_id = p.business_id and s.id = p.supplier_id
    left join product_stock st on st.business_id = p.business_id and st.product_id = p.id
`;

const ORDER_BY = {
  name: "p.name asc",
  sku: "p.sku asc",
  cost: "p.cost_price desc, p.name asc",
  onhand: "on_hand desc, p.name asc",
  updated: "p.updated_at desc, p.name asc",
} as const;

type Row = {
  id: string;
  name: string;
  sku: string;
  supplier_sku: string | null;
  unit_of_measure: string;
  category_id: string | null;
  category_name: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  cost_price: string;
  selling_price: string | null;
  reorder_level: string;
  target_stock_level: string | null;
  on_hand: string;
  description: string | null;
  is_archived: boolean;
};

function toSummary(row: Row): ProductSummary {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    supplierSku: row.supplier_sku,
    unitOfMeasure: row.unit_of_measure,
    categoryId: row.category_id,
    categoryName: row.category_name,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    costPrice: row.cost_price,
    sellingPrice: row.selling_price,
    reorderLevel: row.reorder_level,
    targetStockLevel: row.target_stock_level,
    onHand: row.on_hand,
    description: row.description,
    isArchived: row.is_archived,
  };
}

/** Escape LIKE metacharacters so a search for "50%" is a search, not a wildcard. */
function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, "\\$&")}%`;
}

export type ProductListOptions = {
  search?: string;
  categoryId?: string;
  includeArchived?: boolean;
  sort?: string;
  page?: number;
  pageSize?: number;
};

export async function listProducts(
  userId: string,
  businessId: string,
  options: ProductListOptions = {},
  client?: PoolClient,
): Promise<{ products: ProductSummary[]; total: number }> {
  const search = options.search?.trim().slice(0, 80) ?? "";
  const categoryId =
    options.categoryId && UUID_PATTERN.test(options.categoryId)
      ? options.categoryId
      : null;
  const includeArchived = options.includeArchived === true;
  const sort = parseProductSort(options.sort);
  const pageSize = Math.min(Math.max(options.pageSize ?? 50, 10), 100);
  const page = Math.max(options.page ?? 1, 1);
  const offset = (page - 1) * pageSize;

  return runInTenant(userId, client, async (client) => {
    const filters = `
      where p.business_id = $1
        and ($2::text is null or p.name ilike $2 or p.sku ilike $2)
        and ($3::uuid is null or p.category_id = $3)
        and ($4::boolean or p.is_archived = false)
    `;
    const params = [
      businessId,
      search === "" ? null : likePattern(search),
      categoryId,
      includeArchived,
    ];

    const rows = await client.query<Row>(
      `${SELECT_PRODUCT} ${filters} order by ${ORDER_BY[sort]} limit $5 offset $6`,
      [...params, pageSize, offset],
    );

    const counted = await client.query<{ total: number }>(
      `select count(*)::int as total from products p ${filters}`,
      params,
    );

    return {
      products: rows.rows.map(toSummary),
      total: counted.rows[0]?.total ?? 0,
    };
  });
}

export async function getProduct(
  userId: string,
  businessId: string,
  productId: string,
  client?: PoolClient,
): Promise<ProductSummary | null> {
  if (!UUID_PATTERN.test(productId)) return null;

  return runInTenant(userId, client, async (client) => {
    const result = await client.query<Row>(
      `${SELECT_PRODUCT} where p.business_id = $1 and p.id = $2`,
      [businessId, productId],
    );
    const row = result.rows[0];
    return row ? toSummary(row) : null;
  });
}

export async function listCategories(
  userId: string,
  businessId: string,
  client?: PoolClient,
): Promise<CategoryOption[]> {
  return runInTenant(userId, client, async (client) => {
    const result = await client.query<{
      id: string;
      name: string;
      product_count: number;
    }>(
      `select c.id, c.name, count(p.id)::int as product_count
         from categories c
         left join products p
           on p.business_id = c.business_id and p.category_id = c.id
          and p.is_archived = false
        where c.business_id = $1
        group by c.id, c.name
        order by lower(c.name)`,
      [businessId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      productCount: row.product_count,
    }));
  });
}

/**
 * Everything the product panel reads, on one connection.
 *
 * The panel used to take a transaction per read — the product, its categories and
 * the supplier options. They join here, so opening a row costs one transaction.
 */
export async function getProductPanel(
  userId: string,
  businessId: string,
  request: { mode: "create" | "edit" | "detail"; productId: string },
): Promise<{
  product: ProductSummary | null;
  categories: CategoryOption[];
  suppliers: SupplierOption[];
  price: ProductPriceHistory;
}> {
  return withTenant(userId, async (client) => {
    const [product, categories, suppliers] = await Promise.all([
      request.mode === "create"
        ? null
        : getProduct(userId, businessId, request.productId, client),
      request.mode === "detail"
        ? []
        : listCategories(userId, businessId, client),
      request.mode === "detail"
        ? []
        : listSuppliers(userId, businessId, client),
    ]);
    const price =
      request.mode === "detail" && product !== null
        ? await getProductPriceHistory(
            userId,
            businessId,
            request.productId,
            client,
          )
        : NO_PRICE_HISTORY;
    return { product, categories, suppliers, price };
  });
}

const PRICE_HISTORY_LIMIT = 5;

type PriceRow = {
  unit_cost: string;
  received_at: Date;
  supplier_id: string;
  supplier_name: string;
};

function toPricePaid(row: PriceRow): PricePaid {
  return {
    unitCost: row.unit_cost,
    receivedAt: row.received_at.toISOString(),
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
  };
}

/**
 * What was paid for this product, newest first, from the receipts that already
 * exist. `cost_price` is untouched: this is evidence, not valuation.
 *
 * "Last paid" is read from `product_last_price`, the view that is the single
 * definition of that figure in the database. The history list reads receipt lines
 * directly because the view deliberately collapses to one row per product and
 * supplier; it shares the view's ordering, so the latest entry and `lastPaid`
 * describe the same delivery.
 */
export async function getProductPriceHistory(
  userId: string,
  businessId: string,
  productId: string,
  client?: PoolClient,
): Promise<ProductPriceHistory> {
  if (!UUID_PATTERN.test(productId)) return NO_PRICE_HISTORY;

  return runInTenant(userId, client, async (client) => {
    const latest = await client.query<PriceRow>(
      `select lp.unit_cost::text as unit_cost, lp.received_at,
              lp.supplier_id, s.name as supplier_name
         from product_last_price lp
         join suppliers s
           on s.business_id = lp.business_id and s.id = lp.supplier_id
        where lp.business_id = $1 and lp.product_id = $2
        order by lp.received_at desc
        limit 1`,
      [businessId, productId],
    );
    const history = await client.query<PriceRow>(
      `select rl.unit_cost::text as unit_cost, r.received_at,
              po.supplier_id, s.name as supplier_name
         from purchase_receipt_lines rl
         join purchase_receipts r
           on r.business_id = rl.business_id and r.id = rl.receipt_id
         join purchase_order_lines pol
           on pol.business_id = rl.business_id
          and pol.id = rl.purchase_order_line_id
         join purchase_orders po
           on po.business_id = pol.business_id
          and po.id = pol.purchase_order_id
         join suppliers s
           on s.business_id = po.business_id and s.id = po.supplier_id
        where rl.business_id = $1 and pol.product_id = $2
          and rl.unit_cost is not null
        order by r.received_at desc, rl.id desc
        limit $3`,
      [businessId, productId, PRICE_HISTORY_LIMIT],
    );
    return {
      lastPaid: latest.rows[0] ? toPricePaid(latest.rows[0]) : null,
      entries: history.rows.map(toPricePaid),
    };
  });
}

/**
 * Everything the products page reads, on one connection.
 *
 * The list and the category options used to take a transaction each, so a render
 * paid for two checkouts and two `begin`/`commit` pairs. They join here, which is
 * also one place where the tenant's role is set for the whole read.
 */
export async function getProductsPage(
  userId: string,
  businessId: string,
  options: ProductListOptions,
): Promise<{
  products: ProductSummary[];
  total: number;
  categories: CategoryOption[];
}> {
  return withTenant(userId, async (client) => {
    const [page, categories] = await Promise.all([
      listProducts(userId, businessId, options, client),
      listCategories(userId, businessId, client),
    ]);
    return { ...page, categories };
  });
}

export async function listSuppliers(
  userId: string,
  businessId: string,
  client?: PoolClient,
): Promise<SupplierOption[]> {
  return runInTenant(userId, client, async (client) => {
    const result = await client.query<{ id: string; name: string }>(
      `select id, name from suppliers
        where business_id = $1 and is_archived = false
        order by lower(name)`,
      [businessId],
    );
    return result.rows;
  });
}

export async function createProduct(
  userId: string,
  businessId: string,
  input: ProductInput,
): Promise<string> {
  return withTenant(userId, async (client) => {
    const result = await client.query<{ id: string }>(
      `insert into products
         (business_id, name, sku, description, category_id, supplier_id,
          supplier_sku, unit_of_measure, cost_price, selling_price, reorder_level,
          target_stock_level)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       returning id`,
      [
        businessId,
        input.name,
        input.sku,
        input.description,
        input.categoryId,
        input.supplierId,
        input.supplierSku,
        input.unitOfMeasure,
        input.costPrice,
        input.sellingPrice,
        input.reorderLevel,
        input.targetStockLevel,
      ],
    );
    const id = result.rows[0].id;

    await recordActivity(client, {
      actorUserId: userId,
      businessId,
      action: "product.created",
      entityType: "product",
      entityId: id,
      summary: `Added ${input.name}`,
      detail: { sku: input.sku },
    });
    return id;
  });
}

/** Returns false when the id is not a product in this business. */
export async function updateProduct(
  userId: string,
  businessId: string,
  productId: string,
  input: ProductInput,
): Promise<boolean> {
  if (!UUID_PATTERN.test(productId)) return false;

  return withTenant(userId, async (client) => {
    const result = await client.query(
      `update products
          set name = $3, sku = $4, description = $5, category_id = $6,
              supplier_id = $7, supplier_sku = $8, unit_of_measure = $9,
              cost_price = $10, selling_price = $11, reorder_level = $12,
              target_stock_level = $13, updated_at = now()
        where business_id = $1 and id = $2
        returning id`,
      [
        businessId,
        productId,
        input.name,
        input.sku,
        input.description,
        input.categoryId,
        input.supplierId,
        input.supplierSku,
        input.unitOfMeasure,
        input.costPrice,
        input.sellingPrice,
        input.reorderLevel,
        input.targetStockLevel,
      ],
    );
    if (result.rowCount !== 1) return false;

    await recordActivity(client, {
      actorUserId: userId,
      businessId,
      action: "product.updated",
      entityType: "product",
      entityId: productId,
      summary: `Updated ${input.name}`,
      detail: { sku: input.sku },
    });
    return true;
  });
}

/** Set the catalogue cost only; receipts and their history are untouched. */
export async function setProductCost(
  userId: string,
  businessId: string,
  productId: string,
  costPrice: string,
): Promise<boolean> {
  if (!UUID_PATTERN.test(productId)) return false;

  return withTenant(userId, async (client) => {
    const result = await client.query<{ name: string }>(
      `update products
          set cost_price = $3::numeric, updated_at = now()
        where business_id = $1 and id = $2
        returning name`,
      [businessId, productId, costPrice],
    );
    const name = result.rows[0]?.name;
    if (name === undefined) return false;

    await recordActivity(client, {
      actorUserId: userId,
      businessId,
      action: "product.updated",
      entityType: "product",
      entityId: productId,
      summary: `Changed the cost of ${name}`,
      detail: { cost_price: costPrice },
    });
    return true;
  });
}

export async function setProductArchived(
  userId: string,
  businessId: string,
  productId: string,
  archived: boolean,
): Promise<boolean> {
  if (!UUID_PATTERN.test(productId)) return false;

  return withTenant(userId, async (client) => {
    const result = await client.query<{ name: string }>(
      `update products set is_archived = $3, updated_at = now()
        where business_id = $1 and id = $2
        returning name`,
      [businessId, productId, archived],
    );
    const name = result.rows[0]?.name;
    if (name === undefined) return false;

    await recordActivity(client, {
      actorUserId: userId,
      businessId,
      action: archived ? "product.archived" : "product.restored",
      entityType: "product",
      entityId: productId,
      summary: `${archived ? "Archived" : "Restored"} ${name}`,
    });
    return true;
  });
}

export async function createCategory(
  userId: string,
  businessId: string,
  name: string,
): Promise<string> {
  return withTenant(userId, async (client) => {
    const result = await client.query<{ id: string }>(
      `insert into categories (business_id, name) values ($1, $2) returning id`,
      [businessId, name],
    );
    return result.rows[0].id;
  });
}

/** A duplicate SKU or category name is a user error, not a server fault. */
export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23505";
}
