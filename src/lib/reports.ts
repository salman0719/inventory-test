import { withTenant } from "./db";
import type { OrderStatus } from "./purchase-order-input";
import type { LedgerMovementType } from "./stock-input";
import type {
  MovementTypeFilter,
  OrderReportStatus,
  ReportStatus,
} from "./report-input";

/**
 * Report reads.
 *
 * Every report is a query over the same rows the operational screens use, with no
 * stored totals: the CSV export runs the identical query with the page limit
 * removed, so the file and the screen cannot disagree.
 */

export type StockReportRow = {
  id: string;
  name: string;
  sku: string;
  unitOfMeasure: string;
  categoryName: string | null;
  supplierName: string | null;
  onHand: string;
  reorderLevel: string;
  onOrder: string;
  unitCost: string;
  stockValue: string;
};

export type MovementReportRow = {
  id: string;
  createdAt: string;
  productId: string;
  productName: string;
  sku: string;
  unitOfMeasure: string;
  movementType: LedgerMovementType;
  quantityDelta: string;
  reason: string | null;
  referenceType: string | null;
};

export type OrderReportRow = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  supplierName: string;
  orderedAt: string | null;
  expectedDeliveryAt: string | null;
  lineCount: number;
  receivedLines: number;
  totalValue: string;
  outstandingValue: string;
};

export type ValuationRow = {
  categoryName: string;
  products: number;
  value: string;
};

export type ValuationReport = {
  rows: ValuationRow[];
  totalValue: string;
  totalProducts: number;
};

export type ReportPage<Row> = { rows: Row[]; total: number };

function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, "\\$&")}%`;
}

function searchParam(search: string | undefined): string | null {
  const trimmed = search?.trim().slice(0, 80) ?? "";
  return trimmed === "" ? null : likePattern(trimmed);
}

/** `null` means every matching row, which is what an export needs. */
function limitClause(pageSize: number | null, nextParam: number): string {
  return pageSize === null
    ? ""
    : ` limit $${nextParam} offset $${nextParam + 1}`;
}

const ON_ORDER_CTE = `
  select l.product_id,
         sum(l.quantity_ordered - l.received_quantity) as quantity
    from purchase_order_lines l
    join purchase_orders po
      on po.business_id = l.business_id and po.id = l.purchase_order_id
   where l.business_id = $1
     and po.status in ('ordered', 'partially_received')
   group by l.product_id
`;

const LOW_SQL = `(coalesce(st.on_hand, 0) > 0 and p.reorder_level > 0
                  and coalesce(st.on_hand, 0) <= p.reorder_level)`;
const OUT_SQL = `(coalesce(st.on_hand, 0) <= 0)`;

const STOCK_FILTER = `
  and ($2::text is null or p.name ilike $2 or p.sku ilike $2)
  and ($3::text is null
       or ($3 = 'attention' and (${OUT_SQL} or ${LOW_SQL}))
       or ($3 = 'out' and ${OUT_SQL})
       or ($3 = 'low' and ${LOW_SQL})
       or ($3 = 'ok' and not ${OUT_SQL} and not ${LOW_SQL}))
`;

export async function getStockReport(
  userId: string,
  businessId: string,
  options: {
    search?: string;
    status?: ReportStatus;
    page?: number;
    pageSize?: number | null;
  } = {},
): Promise<ReportPage<StockReportRow>> {
  const pageSize =
    options.pageSize === null
      ? null
      : Math.min(Math.max(options.pageSize ?? 50, 10), 100);
  const page = Math.max(options.page ?? 1, 1);
  const offset = (page - 1) * (pageSize ?? 0);
  const status =
    options.status && options.status !== "all" ? options.status : null;

  return withTenant(userId, async (client) => {
    const params = [businessId, searchParam(options.search), status];
    const limitValues = pageSize === null ? [] : [pageSize, offset];

    const rows = await client.query<{
      id: string;
      name: string;
      sku: string;
      unit_of_measure: string;
      category_name: string | null;
      supplier_name: string | null;
      on_hand: string;
      reorder_level: string;
      on_order: string;
      unit_cost: string;
      stock_value: string;
    }>(
      `with on_order as (${ON_ORDER_CTE})
       select p.id, p.name, p.sku, p.unit_of_measure,
              c.name as category_name, s.name as supplier_name,
              coalesce(st.on_hand, 0)::text as on_hand,
              p.reorder_level::text as reorder_level,
              coalesce(oo.quantity, 0)::text as on_order,
              p.cost_price::text as unit_cost,
              round(coalesce(st.on_hand, 0) * p.cost_price, 2)::text
                as stock_value
         from products p
         left join categories c
           on c.business_id = p.business_id and c.id = p.category_id
         left join product_suppliers ps
           on ps.business_id = p.business_id and ps.product_id = p.id
          and ps.is_default
         left join suppliers s
           on s.business_id = p.business_id and s.id = ps.supplier_id
         left join product_stock st
           on st.business_id = p.business_id and st.product_id = p.id
         left join on_order oo on oo.product_id = p.id
        where p.business_id = $1 and p.is_archived = false
        ${STOCK_FILTER}
        order by ${
          status === "attention"
            ? // A shortage list is read in order of severity: nothing left, then
              // almost nothing, then by name.
              "(coalesce(st.on_hand, 0) > 0), coalesce(st.on_hand, 0), lower(p.name) asc"
            : "lower(p.name) asc, p.sku asc"
        }
        ${limitClause(pageSize, 4)}`,
      [...params, ...limitValues],
    );

    const counted = await client.query<{ total: number }>(
      `select count(*)::int as total
         from products p
         left join product_stock st
           on st.business_id = p.business_id and st.product_id = p.id
        where p.business_id = $1 and p.is_archived = false
        ${STOCK_FILTER}`,
      params,
    );

    return {
      rows: rows.rows.map((row) => ({
        id: row.id,
        name: row.name,
        sku: row.sku,
        unitOfMeasure: row.unit_of_measure,
        categoryName: row.category_name,
        supplierName: row.supplier_name,
        onHand: row.on_hand,
        reorderLevel: row.reorder_level,
        onOrder: row.on_order,
        unitCost: row.unit_cost,
        stockValue: row.stock_value,
      })),
      total: counted.rows[0]?.total ?? 0,
    };
  });
}

export async function getMovementReport(
  userId: string,
  businessId: string,
  options: {
    search?: string;
    movementType?: MovementTypeFilter;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number | null;
  } = {},
): Promise<ReportPage<MovementReportRow>> {
  const pageSize =
    options.pageSize === null
      ? null
      : Math.min(Math.max(options.pageSize ?? 50, 10), 100);
  const page = Math.max(options.page ?? 1, 1);
  const offset = (page - 1) * (pageSize ?? 0);
  const from = options.from && options.from !== "" ? options.from : null;
  const to = options.to && options.to !== "" ? options.to : null;
  const movementType =
    options.movementType && options.movementType !== "all"
      ? options.movementType
      : null;

  return withTenant(userId, async (client) => {
    const filters = `
      where m.business_id = $1
        and ($2::text is null or p.name ilike $2 or p.sku ilike $2)
        and ($3::text is null or m.movement_type = $3)
        and ($4::text is null or m.created_at >= $4::date)
        and ($5::text is null
             or m.created_at < ($5::date + interval '1 day'))
    `;
    const params = [
      businessId,
      searchParam(options.search),
      movementType,
      from,
      to,
    ];
    const limitValues = pageSize === null ? [] : [pageSize, offset];

    const rows = await client.query<{
      id: string;
      created_at: Date;
      product_id: string;
      product_name: string;
      sku: string;
      unit_of_measure: string;
      movement_type: LedgerMovementType;
      quantity_delta: string;
      reason: string | null;
      reference_type: string | null;
    }>(
      `select m.id, m.created_at, m.product_id, p.name as product_name,
              p.sku, p.unit_of_measure, m.movement_type,
              m.quantity_delta::text as quantity_delta, m.reason,
              m.reference_type
         from stock_movements m
         join products p
           on p.business_id = m.business_id and p.id = m.product_id
        ${filters}
        order by m.created_at desc, m.id desc
        ${limitClause(pageSize, 6)}`,
      [...params, ...limitValues],
    );

    const counted = await client.query<{ total: number }>(
      `select count(*)::int as total
         from stock_movements m
         join products p
           on p.business_id = m.business_id and p.id = m.product_id
        ${filters}`,
      params,
    );

    return {
      rows: rows.rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at.toISOString(),
        productId: row.product_id,
        productName: row.product_name,
        sku: row.sku,
        unitOfMeasure: row.unit_of_measure,
        movementType: row.movement_type,
        quantityDelta: row.quantity_delta,
        reason: row.reason,
        referenceType: row.reference_type,
      })),
      total: counted.rows[0]?.total ?? 0,
    };
  });
}

export async function getOrderStatusReport(
  userId: string,
  businessId: string,
  options: {
    search?: string;
    status?: OrderReportStatus;
    page?: number;
    pageSize?: number | null;
  } = {},
): Promise<ReportPage<OrderReportRow>> {
  const pageSize =
    options.pageSize === null
      ? null
      : Math.min(Math.max(options.pageSize ?? 50, 10), 100);
  const page = Math.max(options.page ?? 1, 1);
  const offset = (page - 1) * (pageSize ?? 0);
  const status =
    options.status && options.status !== "all" ? options.status : null;

  return withTenant(userId, async (client) => {
    const filters = `
      where po.business_id = $1
        and ($2::text is null or po.order_number ilike $2 or s.name ilike $2)
        and ($3::text is null
             or ($3 = 'open'
                 and po.status in ('ordered', 'partially_received'))
             or po.status = $3)
    `;
    const params = [businessId, searchParam(options.search), status];
    const limitValues = pageSize === null ? [] : [pageSize, offset];

    const rows = await client.query<{
      id: string;
      order_number: string;
      status: OrderStatus;
      supplier_name: string;
      ordered_at: Date | null;
      expected_delivery_at: string | null;
      line_count: number;
      received_lines: number;
      total_value: string;
      outstanding_value: string;
    }>(
      `select po.id, po.order_number, po.status, s.name as supplier_name,
              po.ordered_at,
              po.expected_delivery_at::text as expected_delivery_at,
              count(l.id)::int as line_count,
              count(l.id) filter (
                where l.received_quantity >= l.quantity_ordered
              )::int as received_lines,
              coalesce(sum(l.quantity_ordered * l.unit_cost), 0)::numeric(12, 2)::text
                as total_value,
              coalesce(
                sum(
                  case
                    when po.status in ('ordered', 'partially_received')
                    then (l.quantity_ordered - l.received_quantity) * l.unit_cost
                    else 0
                  end
                ),
                0
              )::numeric(12, 2)::text as outstanding_value
         from purchase_orders po
         join suppliers s
           on s.business_id = po.business_id and s.id = po.supplier_id
         left join purchase_order_lines l
           on l.business_id = po.business_id and l.purchase_order_id = po.id
        ${filters}
        group by po.id, s.name
        order by po.created_at desc, po.order_number desc
        ${limitClause(pageSize, 4)}`,
      [...params, ...limitValues],
    );

    const counted = await client.query<{ total: number }>(
      `select count(*)::int as total
         from (
           select po.id
             from purchase_orders po
             join suppliers s
               on s.business_id = po.business_id and s.id = po.supplier_id
            ${filters}
            group by po.id
         ) orders`,
      params,
    );

    return {
      rows: rows.rows.map((row) => ({
        id: row.id,
        orderNumber: row.order_number,
        status: row.status,
        supplierName: row.supplier_name,
        orderedAt: row.ordered_at ? row.ordered_at.toISOString() : null,
        expectedDeliveryAt: row.expected_delivery_at,
        lineCount: row.line_count,
        receivedLines: row.received_lines,
        totalValue: row.total_value,
        outstandingValue: row.outstanding_value,
      })),
      total: counted.rows[0]?.total ?? 0,
    };
  });
}

export async function getValuationReport(
  userId: string,
  businessId: string,
): Promise<ValuationReport> {
  return withTenant(userId, async (client) => {
    const result = await client.query<{
      category_name: string;
      products: number;
      value: string;
    }>(
      `select coalesce(c.name, 'Uncategorised') as category_name,
              count(*)::int as products,
              round(coalesce(sum(coalesce(st.on_hand, 0) * p.cost_price), 0), 2)::text
                as value
         from products p
         left join categories c
           on c.business_id = p.business_id and c.id = p.category_id
         left join product_stock st
           on st.business_id = p.business_id and st.product_id = p.id
        where p.business_id = $1 and p.is_archived = false
        group by c.name
        order by sum(coalesce(st.on_hand, 0) * p.cost_price) desc,
                 c.name asc`,
      [businessId],
    );

    const rows = result.rows.map((row) => ({
      categoryName: row.category_name,
      products: row.products,
      value: row.value,
    }));

    // Sum in cents so the total never inherits a floating-point tail.
    const cents = rows.reduce(
      (sum, row) => sum + Math.round(Number(row.value) * 100),
      0,
    );

    return {
      rows,
      totalValue: (cents / 100).toFixed(2),
      totalProducts: rows.reduce((sum, row) => sum + row.products, 0),
    };
  });
}
