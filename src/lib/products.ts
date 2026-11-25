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
  unitOfMeasure: string;
  categoryId: string | null;
  categoryName: string | null;
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

/** One supplier a product can be bought from, with its own terms. */
export type ProductSupplierLink = {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierSku: string | null;
  /** The link's override, or null when the supplier's lead time applies. */
  leadTimeDays: number | null;
  /** The link's lead time, falling back to the supplier's. */
  effectiveLeadTimeDays: number | null;
  isDefault: boolean;
};

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
  select p.id, p.name, p.sku, p.unit_of_measure,
         p.category_id, c.name as category_name,
         p.cost_price, p.selling_price,
         p.reorder_level, p.target_stock_level, p.description, p.is_archived,
         coalesce(st.on_hand, 0)::text as on_hand
    from products p
    left join categories c on c.business_id = p.business_id and c.id = p.category_id
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
  unit_of_measure: string;
  category_id: string | null;
  category_name: string | null;
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
    unitOfMeasure: row.unit_of_measure,
    categoryId: row.category_id,
    categoryName: row.category_name,
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
  links: ProductSupplierLink[];
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
      // Detail needs the options too: alternates are added from the panel.
      listSuppliers(userId, businessId, client),
    ]);
    const links =
      request.mode !== "create" && product !== null
        ? await listProductSupplierLinks(
            userId,
            businessId,
            request.productId,
            client,
          )
        : [];
    const price =
      request.mode === "detail" && product !== null
        ? await getProductPriceHistory(
            userId,
            businessId,
            request.productId,
            client,
          )
        : NO_PRICE_HISTORY;
    return { product, categories, suppliers, links, price };
  });
}

export async function listProductSupplierLinks(
  userId: string,
  businessId: string,
  productId: string,
  client?: PoolClient,
): Promise<ProductSupplierLink[]> {
  if (!UUID_PATTERN.test(productId)) return [];

  return runInTenant(userId, client, async (client) => {
    const result = await client.query<{
      id: string;
      supplier_id: string;
      supplier_name: string;
      supplier_sku: string | null;
      lead_time_days: number | null;
      effective_lead_time_days: number | null;
      is_default: boolean;
    }>(
      `select ps.id, ps.supplier_id, s.name as supplier_name,
              ps.supplier_sku, ps.lead_time_days,
              coalesce(ps.lead_time_days, s.lead_time_days)::int
                as effective_lead_time_days,
              ps.is_default
         from product_suppliers ps
         join suppliers s
           on s.business_id = ps.business_id and s.id = ps.supplier_id
        where ps.business_id = $1 and ps.product_id = $2
        order by ps.is_default desc, lower(s.name)`,
      [businessId, productId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      supplierSku: row.supplier_sku,
      leadTimeDays: row.lead_time_days,
      effectiveLeadTimeDays: row.effective_lead_time_days,
      isDefault: row.is_default,
    }));
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

/**
 * Make a supplier the product's default, without disturbing its alternates.
 *
 * The old default stays linked as an alternate: changing who supplies a product
 * today does not erase the wholesaler that supplied it last month. The partial
 * unique index is the database's guarantee that the unset-then-set is atomic.
 */
async function setDefaultSupplierLink(
  client: PoolClient,
  businessId: string,
  productId: string,
  supplierId: string,
  supplierSku: string | null,
): Promise<void> {
  await client.query(
    `update product_suppliers
        set is_default = false, updated_at = now()
      where business_id = $1 and product_id = $2
        and supplier_id <> $3 and is_default`,
    [businessId, productId, supplierId],
  );
  await client.query(
    `insert into product_suppliers
       (business_id, product_id, supplier_id, supplier_sku, is_default)
     values ($1, $2, $3, $4, true)
     on conflict (business_id, product_id, supplier_id) do update
       set supplier_sku = excluded.supplier_sku,
           is_default = true,
           updated_at = now()`,
    [businessId, productId, supplierId, supplierSku],
  );
}

export async function createProduct(
  userId: string,
  businessId: string,
  input: ProductInput,
): Promise<string> {
  return withTenant(userId, async (client) => {
    const result = await client.query<{ id: string }>(
      `insert into products
         (business_id, name, sku, description, category_id, unit_of_measure,
          cost_price, selling_price, reorder_level, target_stock_level)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning id`,
      [
        businessId,
        input.name,
        input.sku,
        input.description,
        input.categoryId,
        input.unitOfMeasure,
        input.costPrice,
        input.sellingPrice,
        input.reorderLevel,
        input.targetStockLevel,
      ],
    );
    const id = result.rows[0].id;
    await setDefaultSupplierLink(
      client,
      businessId,
      id,
      input.supplierId,
      input.supplierSku,
    );

    await recordActivity(client, {
      actorUserId: userId,
      businessId,
      action: "product.created",
      entityType: "product",
      entityId: id,
      summary: `Added ${input.name}`,
      detail: { sku: input.sku, supplier_id: input.supplierId },
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
              unit_of_measure = $7, cost_price = $8, selling_price = $9,
              reorder_level = $10, target_stock_level = $11, updated_at = now()
        where business_id = $1 and id = $2
        returning id`,
      [
        businessId,
        productId,
        input.name,
        input.sku,
        input.description,
        input.categoryId,
        input.unitOfMeasure,
        input.costPrice,
        input.sellingPrice,
        input.reorderLevel,
        input.targetStockLevel,
      ],
    );
    if (result.rowCount !== 1) return false;

    await setDefaultSupplierLink(
      client,
      businessId,
      productId,
      input.supplierId,
      input.supplierSku,
    );

    await recordActivity(client, {
      actorUserId: userId,
      businessId,
      action: "product.updated",
      entityType: "product",
      entityId: productId,
      summary: `Updated ${input.name}`,
      detail: { sku: input.sku, supplier_id: input.supplierId },
    });
    return true;
  });
}

export type SupplierLinkResult = { ok: true } | { ok: false; error: string };

export async function addProductSupplier(
  userId: string,
  businessId: string,
  productId: string,
  input: {
    supplierId: string;
    supplierSku: string | null;
    leadTimeDays: number | null;
  },
): Promise<SupplierLinkResult> {
  if (!UUID_PATTERN.test(productId) || !UUID_PATTERN.test(input.supplierId)) {
    return {
      ok: false,
      error: "That product or supplier is not in this business.",
    };
  }

  return withTenant(userId, async (client) => {
    const target = await client.query<{
      product_name: string;
      supplier_name: string;
    }>(
      `select p.name as product_name, s.name as supplier_name
         from products p
         join suppliers s
           on s.business_id = p.business_id and s.id = $3
          and s.is_archived = false
        where p.business_id = $1 and p.id = $2`,
      [businessId, productId, input.supplierId],
    );
    const row = target.rows[0];
    if (!row) {
      return {
        ok: false as const,
        error: "That product or active supplier is not in this business.",
      };
    }

    await client.query(
      `insert into product_suppliers
         (business_id, product_id, supplier_id, supplier_sku, lead_time_days,
          is_default)
       values ($1, $2, $3, $4, $5, false)`,
      [
        businessId,
        productId,
        input.supplierId,
        input.supplierSku,
        input.leadTimeDays,
      ],
    );

    await recordActivity(client, {
      actorUserId: userId,
      businessId,
      action: "product.updated",
      entityType: "product",
      entityId: productId,
      summary: `Added ${row.supplier_name} to ${row.product_name}`,
      detail: { supplier_id: input.supplierId },
    });
    return { ok: true as const };
  });
}

export async function setDefaultProductSupplier(
  userId: string,
  businessId: string,
  productId: string,
  linkId: string,
): Promise<SupplierLinkResult> {
  if (!UUID_PATTERN.test(productId) || !UUID_PATTERN.test(linkId)) {
    return { ok: false, error: "That supplier link is not in this business." };
  }

  return withTenant(userId, async (client) => {
    const link = await client.query<{
      supplier_id: string;
      supplier_name: string;
      product_name: string;
      is_default: boolean;
    }>(
      `select ps.supplier_id, s.name as supplier_name, p.name as product_name,
              ps.is_default
         from product_suppliers ps
         join suppliers s
           on s.business_id = ps.business_id and s.id = ps.supplier_id
         join products p
           on p.business_id = ps.business_id and p.id = ps.product_id
        where ps.business_id = $1 and ps.product_id = $2 and ps.id = $3`,
      [businessId, productId, linkId],
    );
    const row = link.rows[0];
    if (!row) {
      return {
        ok: false as const,
        error: "That supplier link is not in this business.",
      };
    }
    if (row.is_default) return { ok: true as const };

    await client.query(
      `update product_suppliers set is_default = false, updated_at = now()
        where business_id = $1 and product_id = $2 and is_default`,
      [businessId, productId],
    );
    await client.query(
      `update product_suppliers set is_default = true, updated_at = now()
        where business_id = $1 and product_id = $2 and id = $3`,
      [businessId, productId, linkId],
    );

    await recordActivity(client, {
      actorUserId: userId,
      businessId,
      action: "product.updated",
      entityType: "product",
      entityId: productId,
      summary: `Made ${row.supplier_name} the default supplier for ${row.product_name}`,
      detail: { supplier_id: row.supplier_id },
    });
    return { ok: true as const };
  });
}

export async function removeProductSupplier(
  userId: string,
  businessId: string,
  productId: string,
  linkId: string,
): Promise<SupplierLinkResult> {
  if (!UUID_PATTERN.test(productId) || !UUID_PATTERN.test(linkId)) {
    return { ok: false, error: "That supplier link is not in this business." };
  }

  return withTenant(userId, async (client) => {
    const link = await client.query<{
      supplier_id: string;
      supplier_name: string;
      is_default: boolean;
      product_name: string;
      has_open_order: boolean;
    }>(
      `select ps.supplier_id, s.name as supplier_name, ps.is_default,
              p.name as product_name,
              exists (
                select 1
                  from purchase_order_lines l
                  join purchase_orders po
                    on po.business_id = l.business_id
                   and po.id = l.purchase_order_id
                 where l.business_id = ps.business_id
                   and l.product_id = ps.product_id
                   and po.supplier_id = ps.supplier_id
                   and po.status in ('draft', 'ordered', 'partially_received')
              ) as has_open_order
         from product_suppliers ps
         join suppliers s
           on s.business_id = ps.business_id and s.id = ps.supplier_id
         join products p
           on p.business_id = ps.business_id and p.id = ps.product_id
        where ps.business_id = $1 and ps.product_id = $2 and ps.id = $3`,
      [businessId, productId, linkId],
    );
    const row = link.rows[0];
    if (!row) {
      return {
        ok: false as const,
        error: "That supplier link is not in this business.",
      };
    }
    if (row.is_default) {
      return {
        ok: false as const,
        error: "Choose another default supplier before removing this one.",
      };
    }
    if (row.has_open_order) {
      return {
        ok: false as const,
        error: `${row.supplier_name} has an open order with this product. Receive or close it before removing the supplier.`,
      };
    }

    await client.query(
      `delete from product_suppliers
        where business_id = $1 and product_id = $2 and id = $3`,
      [businessId, productId, linkId],
    );

    await recordActivity(client, {
      actorUserId: userId,
      businessId,
      action: "product.updated",
      entityType: "product",
      entityId: productId,
      summary: `Removed ${row.supplier_name} from ${row.product_name}`,
      detail: { supplier_id: row.supplier_id },
    });
    return { ok: true as const };
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
