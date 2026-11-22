import type { PoolClient } from "pg";
import { runInTenant, withTenant } from "./db";
import { listCategories, type CategoryOption } from "./products";
import {
  parseStockFilter,
  parseStockSort,
  signedQuantity,
  type LedgerMovementType,
  type StockMovementInput,
} from "./stock-input";

/**
 * Inventory data access.
 *
 * On-hand is never stored: it is the sum of the ledger, read through the
 * `product_stock` view. Writes go through `private.record_stock_movement`, because
 * `authenticated` holds no INSERT grant on `stock_movements`.
 */

export type InventoryItem = {
  id: string;
  name: string;
  sku: string;
  unitOfMeasure: string;
  categoryName: string | null;
  supplierName: string | null;
  onHand: string;
  reorderLevel: string;
  costPrice: string;
  stockValue: string;
  isArchived: boolean;
};

export type StockMovement = {
  id: string;
  movementType: LedgerMovementType;
  quantityDelta: string;
  reason: string | null;
  referenceType: string | null;
  createdAt: string;
};

export type StockSummary = {
  products: number;
  lowCount: number;
  outCount: number;
  stockValue: string;
};

export type MovementResult =
  { ok: true; onHand: string } | { ok: false; error: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SELECT_ITEM = `
  select p.id, p.name, p.sku, p.unit_of_measure, c.name as category_name,
         s.name as supplier_name, coalesce(st.on_hand, 0)::text as on_hand,
         p.reorder_level::text as reorder_level,
         p.cost_price::text as cost_price,
         round(coalesce(st.on_hand, 0) * p.cost_price, 2)::text as stock_value,
         p.is_archived
    from products p
    left join categories c on c.business_id = p.business_id and c.id = p.category_id
    left join suppliers s on s.business_id = p.business_id and s.id = p.supplier_id
    left join product_stock st
      on st.business_id = p.business_id and st.product_id = p.id
`;

type ItemRow = {
  id: string;
  name: string;
  sku: string;
  unit_of_measure: string;
  category_name: string | null;
  supplier_name: string | null;
  on_hand: string;
  reorder_level: string;
  cost_price: string;
  stock_value: string;
  is_archived: boolean;
};

function toItem(row: ItemRow): InventoryItem {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    unitOfMeasure: row.unit_of_measure,
    categoryName: row.category_name,
    supplierName: row.supplier_name,
    onHand: row.on_hand,
    reorderLevel: row.reorder_level,
    costPrice: row.cost_price,
    stockValue: row.stock_value,
    isArchived: row.is_archived,
  };
}

/** Matches `stockStatus` in product-input: zero or below is out, at the reorder
 * level or below is low. Kept in SQL so the filter and the label cannot disagree. */
const LOW_SQL = `(coalesce(st.on_hand, 0) > 0 and p.reorder_level > 0
                  and coalesce(st.on_hand, 0) <= p.reorder_level)`;
const OUT_SQL = `(coalesce(st.on_hand, 0) <= 0)`;

const ORDER_BY = {
  name: "lower(p.name) asc, p.sku asc",
  low: "coalesce(st.on_hand, 0) asc, lower(p.name) asc",
  high: "coalesce(st.on_hand, 0) desc, lower(p.name) asc",
} as const;

function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, "\\$&")}%`;
}

export type InventoryListOptions = {
  search?: string;
  categoryId?: string;
  status?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
};

export async function listInventory(
  userId: string,
  businessId: string,
  options: InventoryListOptions = {},
  client?: PoolClient,
): Promise<{ items: InventoryItem[]; total: number }> {
  const search = options.search?.trim().slice(0, 80) ?? "";
  const categoryId =
    options.categoryId && UUID_PATTERN.test(options.categoryId)
      ? options.categoryId
      : null;
  const status = parseStockFilter(options.status);
  const sort = parseStockSort(options.sort);
  const pageSize = Math.min(Math.max(options.pageSize ?? 50, 10), 100);
  const page = Math.max(options.page ?? 1, 1);
  const offset = (page - 1) * pageSize;

  return runInTenant(userId, client, async (client) => {
    const filters = `
      where p.business_id = $1
        and p.is_archived = false
        and ($2::text is null or p.name ilike $2 or p.sku ilike $2)
        and ($3::uuid is null or p.category_id = $3)
        and ($4::text is null
             or ($4 = 'out' and ${OUT_SQL})
             or ($4 = 'low' and ${LOW_SQL})
             or ($4 = 'ok' and not ${OUT_SQL} and not ${LOW_SQL}))
    `;
    const params = [
      businessId,
      search === "" ? null : likePattern(search),
      categoryId,
      status === "all" ? null : status,
    ];

    const rows = await client.query<ItemRow>(
      `${SELECT_ITEM} ${filters} order by ${ORDER_BY[sort]} limit $5 offset $6`,
      [...params, pageSize, offset],
    );

    const counted = await client.query<{ total: number }>(
      `select count(*)::int as total
         from products p
         left join product_stock st
           on st.business_id = p.business_id and st.product_id = p.id
        ${filters}`,
      params,
    );

    return {
      items: rows.rows.map(toItem),
      total: counted.rows[0]?.total ?? 0,
    };
  });
}

/** Counts and value for the whole (unfiltered) inventory, not just one page. */
export async function getStockSummary(
  userId: string,
  businessId: string,
  client?: PoolClient,
): Promise<StockSummary> {
  return runInTenant(userId, client, async (client) => {
    const result = await client.query<{
      products: number;
      low_count: number;
      out_count: number;
      stock_value: string;
    }>(
      `select count(*)::int as products,
              count(*) filter (where ${LOW_SQL})::int as low_count,
              count(*) filter (where ${OUT_SQL})::int as out_count,
              round(coalesce(sum(coalesce(st.on_hand, 0) * p.cost_price), 0), 2)::text
                as stock_value
         from products p
         left join product_stock st
           on st.business_id = p.business_id and st.product_id = p.id
        where p.business_id = $1 and p.is_archived = false`,
      [businessId],
    );
    const row = result.rows[0];
    return {
      products: row?.products ?? 0,
      lowCount: row?.low_count ?? 0,
      outCount: row?.out_count ?? 0,
      stockValue: row?.stock_value ?? "0",
    };
  });
}

/**
 * Everything the inventory page reads, on one connection: the page of items, the
 * shortages summary and the category options.
 *
 * Those were three transactions per render; joining them removes two checkouts and
 * two `begin`/`commit` pairs, and sets the tenant's role once for all three reads.
 */
export async function getInventoryPage(
  userId: string,
  businessId: string,
  options: InventoryListOptions,
): Promise<{
  items: InventoryItem[];
  total: number;
  summary: StockSummary;
  categories: CategoryOption[];
}> {
  return withTenant(userId, async (client) => {
    const [page, summary, categories] = await Promise.all([
      listInventory(userId, businessId, options, client),
      getStockSummary(userId, businessId, client),
      listCategories(userId, businessId, client),
    ]);
    return { ...page, summary, categories };
  });
}

export async function getInventoryDetail(
  userId: string,
  businessId: string,
  productId: string,
  movementLimit = 12,
): Promise<{ item: InventoryItem; movements: StockMovement[] } | null> {
  if (!UUID_PATTERN.test(productId)) return null;

  return withTenant(userId, async (client) => {
    const itemResult = await client.query<ItemRow>(
      `${SELECT_ITEM} where p.business_id = $1 and p.id = $2`,
      [businessId, productId],
    );
    const item = itemResult.rows[0];
    if (!item) return null;

    const movements = await client.query<{
      id: string;
      movement_type: string;
      quantity_delta: string;
      reason: string | null;
      reference_type: string | null;
      created_at: Date;
    }>(
      `select m.id, m.movement_type, m.quantity_delta::text as quantity_delta,
              m.reason, m.reference_type, m.created_at
         from stock_movements m
        where m.business_id = $1 and m.product_id = $2
        order by m.created_at desc, m.id desc
        limit $3`,
      [businessId, productId, movementLimit],
    );

    return {
      item: toItem(item),
      movements: movements.rows.map((row) => ({
        id: row.id,
        movementType: row.movement_type as LedgerMovementType,
        quantityDelta: row.quantity_delta,
        reason: row.reason,
        referenceType: row.reference_type,
        createdAt: row.created_at.toISOString(),
      })),
    };
  });
}

/**
 * Append one manual movement. The delta is signed here, then the database function
 * checks membership and role, locks the product, refuses a negative result and
 * records the caller.
 */
export async function recordStockMovement(
  userId: string,
  businessId: string,
  input: StockMovementInput,
): Promise<MovementResult> {
  const delta = signedQuantity(
    input.movementType,
    input.direction,
    input.quantity,
  );

  try {
    return await withTenant(userId, async (client) => {
      // Keep the panel's product inside the active business. The function derives
      // the business from the product, so this is the UI scope, not the boundary.
      const owned = await client.query(
        "select id from products where business_id = $1 and id = $2",
        [businessId, input.productId],
      );
      if (owned.rowCount !== 1) {
        return {
          ok: false as const,
          error: "That product is not in this business.",
        };
      }

      const result = await client.query<{ on_hand: string }>(
        `select on_hand::text
           from private.record_stock_movement($1, $2, $3::numeric, $4)`,
        [input.productId, input.movementType, delta, input.reason],
      );
      const row = result.rows[0];
      if (!row) {
        return { ok: false as const, error: "The movement was not recorded." };
      }
      return { ok: true as const, onHand: row.on_hand };
    });
  } catch (error) {
    return describeMovementError(error);
  }
}

/**
 * Only the function's own raised messages reach the operator. Anything else is a
 * bug and is rethrown so it is not disguised as a validation message.
 */
function describeMovementError(error: unknown): MovementResult {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message;

  switch (code) {
    case "23514":
      // The database's own message carries the numeric sum at full scale
      // ("-996.000"); the panel already shows the on-hand figure, so use words.
      return {
        ok: false,
        error:
          "That would take stock below zero. Check the quantity against the on-hand figure.",
      };
    case "22023":
      return { ok: false, error: message ?? "That movement was rejected." };
    case "42501":
      return {
        ok: false,
        error: "You do not have permission to change stock in this business.",
      };
    case "P0002":
      return { ok: false, error: "That product is not in this business." };
    default:
      throw error;
  }
}
