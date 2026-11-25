import { readActivity, type ActivityEntry } from "./activity";
import { withTenant } from "./db";
import type { LedgerMovementType } from "./stock-input";

/**
 * Dashboard data: three reads, one transaction, all derived from the tables the
 * other slices write. Nothing here is stored or cached, so the page cannot show a
 * figure the ledger disagrees with.
 *
 * Stock on order counts only orders that are actually with a supplier: a draft
 * reserves nothing.
 */

export type DashboardSummary = {
  products: number;
  suppliers: number;
  lowCount: number;
  outCount: number;
  openOrders: number;
  stockValue: string;
  onOrderValue: string;
};

export type AttentionItem = {
  id: string;
  name: string;
  sku: string;
  unitOfMeasure: string;
  onHand: string;
  reorderLevel: string;
  onOrder: string;
  supplierName: string | null;
};

export type RecentMovement = {
  id: string;
  productId: string;
  productName: string;
  unitOfMeasure: string;
  movementType: LedgerMovementType;
  quantityDelta: string;
  reason: string | null;
  createdAt: string;
};

export type Dashboard = {
  summary: DashboardSummary;
  attention: AttentionItem[];
  movements: RecentMovement[];
  activity: ActivityEntry[];
};

export const ATTENTION_LIMIT = 8;
export const MOVEMENT_LIMIT = 8;
export const ACTIVITY_LIMIT = 6;

const LOW_SQL = `(coalesce(st.on_hand, 0) > 0 and p.reorder_level > 0
                  and coalesce(st.on_hand, 0) <= p.reorder_level)`;

export async function getDashboard(
  userId: string,
  businessId: string,
): Promise<Dashboard> {
  return withTenant(userId, async (client) => {
    const summaryResult = await client.query<{
      products: number;
      suppliers: number;
      low_count: number;
      out_count: number;
      open_orders: number;
      stock_value: string;
      on_order_value: string;
    }>(
      `select count(*)::int as products,
              (select count(*)::int from suppliers s
                where s.business_id = $1 and s.is_archived = false) as suppliers,
              count(*) filter (where ${LOW_SQL})::int as low_count,
              count(*) filter (where coalesce(st.on_hand, 0) <= 0)::int as out_count,
              (select count(*)::int from purchase_orders po
                where po.business_id = $1
                  and po.status in ('ordered', 'partially_received')) as open_orders,
              round(coalesce(sum(coalesce(st.on_hand, 0) * p.cost_price), 0), 2)::text
                as stock_value,
              (select round(coalesce(sum(
                        (l.quantity_ordered - l.received_quantity) * l.unit_cost
                      ), 0), 2)::text
                 from purchase_order_lines l
                 join purchase_orders po
                   on po.business_id = l.business_id
                  and po.id = l.purchase_order_id
                where l.business_id = $1
                  and po.status in ('ordered', 'partially_received')) as on_order_value
         from products p
         left join product_stock st
           on st.business_id = p.business_id and st.product_id = p.id
        where p.business_id = $1 and p.is_archived = false`,
      [businessId],
    );

    const attentionResult = await client.query<{
      id: string;
      name: string;
      sku: string;
      unit_of_measure: string;
      on_hand: string;
      reorder_level: string;
      on_order: string;
      supplier_name: string | null;
    }>(
      `with on_order as (
         select l.product_id,
                sum(l.quantity_ordered - l.received_quantity) as quantity
           from purchase_order_lines l
           join purchase_orders po
             on po.business_id = l.business_id and po.id = l.purchase_order_id
          where l.business_id = $1
            and po.status in ('ordered', 'partially_received')
          group by l.product_id
       )
       select p.id, p.name, p.sku, p.unit_of_measure,
              coalesce(st.on_hand, 0)::text as on_hand,
              p.reorder_level::text as reorder_level,
              coalesce(oo.quantity, 0)::text as on_order,
              s.name as supplier_name
         from products p
         left join product_stock st
           on st.business_id = p.business_id and st.product_id = p.id
         left join on_order oo on oo.product_id = p.id
         left join suppliers s
           on s.business_id = p.business_id and s.id = p.supplier_id
        where p.business_id = $1
          and p.is_archived = false
          and (coalesce(st.on_hand, 0) <= 0 or ${LOW_SQL})
        order by (coalesce(st.on_hand, 0) > 0), coalesce(st.on_hand, 0),
                 lower(p.name)
        limit $2`,
      [businessId, ATTENTION_LIMIT],
    );

    const movementResult = await client.query<{
      id: string;
      product_id: string;
      product_name: string;
      unit_of_measure: string;
      movement_type: LedgerMovementType;
      quantity_delta: string;
      reason: string | null;
      created_at: Date;
    }>(
      `select m.id, m.product_id, p.name as product_name,
              p.unit_of_measure, m.movement_type,
              m.quantity_delta::text as quantity_delta, m.reason, m.created_at
         from stock_movements m
         join products p
           on p.business_id = m.business_id and p.id = m.product_id
        where m.business_id = $1
        order by m.created_at desc, m.id desc
        limit $2`,
      [businessId, MOVEMENT_LIMIT],
    );

    // The feed shares this transaction, so the dashboard still costs one checkout.
    const { entries: activity } = await readActivity(client, businessId, {
      limit: ACTIVITY_LIMIT,
    });

    const row = summaryResult.rows[0];
    return {
      summary: {
        products: row?.products ?? 0,
        suppliers: row?.suppliers ?? 0,
        lowCount: row?.low_count ?? 0,
        outCount: row?.out_count ?? 0,
        openOrders: row?.open_orders ?? 0,
        stockValue: row?.stock_value ?? "0",
        onOrderValue: row?.on_order_value ?? "0",
      },
      attention: attentionResult.rows.map((item) => ({
        id: item.id,
        name: item.name,
        sku: item.sku,
        unitOfMeasure: item.unit_of_measure,
        onHand: item.on_hand,
        reorderLevel: item.reorder_level,
        onOrder: item.on_order,
        supplierName: item.supplier_name,
      })),
      movements: movementResult.rows.map((movement) => ({
        id: movement.id,
        productId: movement.product_id,
        productName: movement.product_name,
        unitOfMeasure: movement.unit_of_measure,
        movementType: movement.movement_type,
        quantityDelta: movement.quantity_delta,
        reason: movement.reason,
        createdAt: movement.created_at.toISOString(),
      })),
      activity,
    };
  });
}
