import type { PoolClient } from "pg";
import { runInTenant } from "./db";
import {
  createPurchaseOrder,
  getPurchaseOrder,
  updateDraftPurchaseOrder,
} from "./purchase-orders";
import type { OrderStatus } from "./purchase-order-input";
import { suggestedDeliveryDate } from "./purchase-order-input";
import {
  reorderTarget,
  suggestedReorderQuantity,
  type ReorderSelection,
} from "./reorder-input";

/**
 * Reorder suggestions, grouped by supplier.
 *
 * The read is one query: active products with an active supplier, their live
 * on-hand sum, what is on an order that has actually been sent, and the supplier's
 * one open order (if any). Draft quantities are deliberately not treated as
 * on-order — a draft has not been promised to anyone — but the screen still marks a
 * product already on the draft so "create order from selection" cannot duplicate it.
 *
 * The write path reuses the purchase-order functions: create a draft when the
 * supplier has none, add lines to their draft when one exists, and refuse when the
 * open order has already been sent. It never creates a second open order.
 */

export type ReorderRow = {
  productId: string;
  name: string;
  sku: string;
  unitOfMeasure: string;
  onHand: string;
  onOrder: string;
  reorderLevel: string;
  targetStockLevel: string | null;
  /** The figure the formula aims for: stored target or reorder level × 2. */
  target: string;
  targetSource: "set" | "fallback";
  suggested: string;
  /** Already a line on this supplier's draft; it cannot be selected again. */
  onDraft: boolean;
};

export type ReorderOpenOrder = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
};

export type ReorderSupplierGroup = {
  supplierId: string;
  supplierName: string;
  leadTimeDays: number | null;
  openOrder: ReorderOpenOrder | null;
  rows: ReorderRow[];
};

export type ReorderPageData = {
  groups: ReorderSupplierGroup[];
  productCount: number;
  supplierCount: number;
  /** Active products with no supplier: they cannot be ordered from this screen. */
  unassignedCount: number;
};

export type ReorderWriteResult =
  | { ok: true; orderId: string; created: boolean }
  | { ok: false; error: string };

type CandidateRow = {
  product_id: string;
  name: string;
  sku: string;
  unit_of_measure: string;
  reorder_level: string;
  target_stock_level: string | null;
  on_hand: string;
  on_order: string;
  supplier_id: string;
  supplier_name: string;
  lead_time_days: number | null;
  open_order_id: string | null;
  order_number: string | null;
  order_status: OrderStatus | null;
  on_draft: boolean;
};

export async function getReorderPage(
  userId: string,
  businessId: string,
  client?: PoolClient,
): Promise<ReorderPageData> {
  return runInTenant(userId, client, async (client) => {
    const result = await client.query<CandidateRow>(
      `with on_order as (
         select l.business_id, l.product_id,
                sum(l.quantity_ordered - l.received_quantity) as quantity
           from purchase_order_lines l
           join purchase_orders po
             on po.business_id = l.business_id and po.id = l.purchase_order_id
          where l.business_id = $1
            and po.status in ('ordered', 'partially_received')
          group by l.business_id, l.product_id
       )
       select p.id as product_id, p.name, p.sku, p.unit_of_measure,
              p.reorder_level::text as reorder_level,
              p.target_stock_level::text as target_stock_level,
              coalesce(st.on_hand, 0)::text as on_hand,
              coalesce(oo.quantity, 0)::text as on_order,
              s.id as supplier_id, s.name as supplier_name, s.lead_time_days,
              open_po.id as open_order_id,
              open_po.order_number,
              open_po.status as order_status,
              (draft_line.id is not null) as on_draft
         from products p
         join suppliers s
           on s.business_id = p.business_id and s.id = p.supplier_id
         left join product_stock st
           on st.business_id = p.business_id and st.product_id = p.id
         left join on_order oo
           on oo.business_id = p.business_id and oo.product_id = p.id
         left join purchase_orders open_po
           on open_po.business_id = p.business_id
          and open_po.supplier_id = p.supplier_id
          and open_po.status in ('draft', 'ordered', 'partially_received')
         left join purchase_order_lines draft_line
           on draft_line.business_id = p.business_id
          and draft_line.purchase_order_id = open_po.id
          and draft_line.product_id = p.id
          and open_po.status = 'draft'
        where p.business_id = $1
          and p.is_archived = false
          and s.is_archived = false
        order by lower(s.name), lower(p.name)`,
      [businessId],
    );

    const groups = new Map<string, ReorderSupplierGroup>();

    for (const row of result.rows) {
      const target = reorderTarget(row.target_stock_level, row.reorder_level);
      const suggested = suggestedReorderQuantity({
        targetStockLevel: row.target_stock_level,
        reorderLevel: row.reorder_level,
        onHand: row.on_hand,
        onOrder: row.on_order,
      });

      // Not a suggestion: the shelf and the sent orders already cover the target.
      if (Number(suggested) <= 0) continue;

      let group = groups.get(row.supplier_id);
      if (!group) {
        group = {
          supplierId: row.supplier_id,
          supplierName: row.supplier_name,
          leadTimeDays: row.lead_time_days,
          openOrder:
            row.open_order_id !== null &&
            row.order_number !== null &&
            row.order_status !== null
              ? {
                  id: row.open_order_id,
                  orderNumber: row.order_number,
                  status: row.order_status,
                }
              : null,
          rows: [],
        };
        groups.set(row.supplier_id, group);
      }

      group.rows.push({
        productId: row.product_id,
        name: row.name,
        sku: row.sku,
        unitOfMeasure: row.unit_of_measure,
        onHand: row.on_hand,
        onOrder: row.on_order,
        reorderLevel: row.reorder_level,
        targetStockLevel: row.target_stock_level,
        target: target.quantity,
        targetSource: target.source,
        suggested,
        onDraft: row.on_draft,
      });
    }

    const ordered = Array.from(groups.values()).sort((left, right) =>
      left.supplierName.localeCompare(right.supplierName, "en-AU", {
        sensitivity: "base",
      }),
    );
    for (const group of ordered) {
      group.rows.sort((left, right) => {
        const difference = Number(right.suggested) - Number(left.suggested);
        return difference !== 0
          ? difference
          : left.name.localeCompare(right.name, "en-AU", {
              sensitivity: "base",
            });
      });
    }

    const unassigned = await client.query<{ total: number }>(
      `select count(*)::int as total
         from products
        where business_id = $1 and is_archived = false and supplier_id is null`,
      [businessId],
    );

    return {
      groups: ordered,
      productCount: ordered.reduce((sum, group) => sum + group.rows.length, 0),
      supplierCount: ordered.length,
      unassignedCount: unassigned.rows[0]?.total ?? 0,
    };
  });
}

type SupplierRow = {
  name: string;
  lead_time_days: number | null;
};

type ProductRow = {
  id: string;
  name: string;
  cost_price: string;
};

type OpenOrderRow = {
  id: string;
  order_number: string;
  status: OrderStatus;
};

/**
 * Turn a selection into a draft, or refuse and say why.
 *
 * Adding to an existing draft is an update of that draft, not a new order: the one
 * open order per supplier rule is exactly what this interaction exists to respect.
 * A product already on the draft is refused rather than merged, because doubling a
 * line silently is worse than asking the operator to change it in the panel.
 */
export async function saveReorderSelection(
  userId: string,
  businessId: string,
  input: ReorderSelection,
  client?: PoolClient,
): Promise<ReorderWriteResult> {
  return runInTenant(userId, client, async (client) => {
    const supplier = await client.query<SupplierRow>(
      `select name, lead_time_days
         from suppliers
        where business_id = $1 and id = $2 and is_archived = false`,
      [businessId, input.supplierId],
    );
    const supplierRow = supplier.rows[0];
    if (!supplierRow) {
      return {
        ok: false as const,
        error: "That supplier is not in this business.",
      };
    }

    const productIds = input.lines.map((line) => line.productId);
    const products = await client.query<ProductRow>(
      `select id, name, cost_price::text as cost_price
         from products
        where business_id = $1 and supplier_id = $2 and is_archived = false
          and id = any($3::uuid[])`,
      [businessId, input.supplierId, productIds],
    );

    if (products.rowCount !== productIds.length) {
      return {
        ok: false as const,
        error: `Some of those products are no longer supplied by ${supplierRow.name}. Reload the suggestions.`,
      };
    }

    const costs = new Map(
      products.rows.map((product) => [product.id, product.cost_price]),
    );
    const names = new Map(
      products.rows.map((product) => [product.id, product.name]),
    );
    const lines = input.lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      unitCost: costs.get(line.productId) ?? "0",
    }));

    const open = await client.query<OpenOrderRow>(
      `select id, order_number, status
         from purchase_orders
        where business_id = $1 and supplier_id = $2
          and status in ('draft', 'ordered', 'partially_received')
        limit 1`,
      [businessId, input.supplierId],
    );
    const openOrder = open.rows[0];

    if (openOrder && openOrder.status !== "draft") {
      return {
        ok: false as const,
        error: `${openOrder.order_number} is already with ${supplierRow.name}. Receive or close it before ordering more.`,
      };
    }

    if (openOrder) {
      const detail = await getPurchaseOrder(
        userId,
        businessId,
        openOrder.id,
        client,
      );
      if (!detail) {
        return {
          ok: false as const,
          error: "That draft is not in this business.",
        };
      }

      const existing = new Set(detail.lines.map((line) => line.productId));
      const duplicate = input.lines.find((line) =>
        existing.has(line.productId),
      );
      if (duplicate) {
        return {
          ok: false as const,
          error: `${names.get(duplicate.productId) ?? "That product"} is already on ${openOrder.order_number}. Change its quantity in that draft.`,
        };
      }

      const result = await updateDraftPurchaseOrder(
        userId,
        businessId,
        openOrder.id,
        {
          supplierId: input.supplierId,
          expectedDeliveryAt: detail.order.expectedDeliveryAt,
          notes: detail.order.notes,
          lines: [
            ...detail.lines.map((line) => ({
              productId: line.productId,
              quantity: line.quantityOrdered,
              unitCost: line.unitCost,
            })),
            ...lines,
          ],
        },
        client,
      );
      if (!result.ok) return { ok: false as const, error: result.error };
      return { ok: true as const, orderId: result.id, created: false };
    }

    const result = await createPurchaseOrder(
      userId,
      businessId,
      {
        supplierId: input.supplierId,
        expectedDeliveryAt: suggestedDeliveryDate(supplierRow.lead_time_days),
        notes: "Created from reorder suggestions.",
        lines,
      },
      client,
    );
    if (!result.ok) return { ok: false as const, error: result.error };
    return { ok: true as const, orderId: result.id, created: true };
  });
}
