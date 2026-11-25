import type { PoolClient } from "pg";
import { runInTenant, withTenant } from "./db";
import type {
  OrderStatus,
  PurchaseOrderInput,
  ReceiptInput,
} from "./purchase-order-input";
import { arrivedQuantity } from "./purchase-order-input";

/**
 * Purchase order data access.
 *
 * Drafts are written directly, inside `withTenant`, because their lines and notes
 * are ordinary business records. Everything that moves stock or changes an order's
 * state goes through the two SECURITY DEFINER functions: `authenticated` holds no
 * grant on `received_quantity`, `status` or the receipts, and the draft-only
 * policies stop edits from racing a delivery.
 */

export type PurchaseOrderSummary = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  supplierId: string;
  supplierName: string;
  expectedDeliveryAt: string | null;
  orderedAt: string | null;
  notes: string | null;
  createdAt: string;
  /** Set when the balance of a partly received order was written off. */
  closedShortAt: string | null;
  closeReason: string | null;
  lineCount: number;
  receivedLines: number;
  totalValue: string;
};

export type PurchaseOrderLine = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  unitOfMeasure: string;
  quantityOrdered: string;
  quantityReceived: string;
  unitCost: string;
  lineTotal: string;
};

export type PurchaseReceipt = {
  id: string;
  receivedAt: string;
  lineCount: number;
  /** What arrived, across the lines. */
  quantity: string;
  accepted: string;
  damaged: string;
  rejected: string;
};

export type PurchaseOrderDetail = {
  order: PurchaseOrderSummary;
  lines: PurchaseOrderLine[];
  receipts: PurchaseReceipt[];
};

export type OrderFormOptions = {
  suppliers: { id: string; name: string; leadTimeDays: number | null }[];
  products: {
    id: string;
    name: string;
    sku: string;
    unitOfMeasure: string;
    costPrice: string;
    supplierId: string | null;
  }[];
};

export type OrderSummary = {
  total: number;
  awaiting: number;
  drafts: number;
  onOrderValue: string;
};

export type OrderWriteResult =
  { ok: true; id: string } | { ok: false; error: string };
export type OrderActionResult = { ok: true } | { ok: false; error: string };
export type ReceiptResult =
  { ok: true; status: OrderStatus } | { ok: false; error: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SELECT_SUMMARY = `
  select po.id, po.order_number, po.status, po.supplier_id,
         s.name as supplier_name, po.expected_delivery_at::text as expected_delivery_at,
         po.ordered_at, po.notes, po.created_at,
         po.closed_short_at, po.close_reason,
         count(l.id)::int as line_count,
         count(l.id) filter (
           where l.received_quantity >= l.quantity_ordered
         )::int as received_lines,
         coalesce(sum(l.quantity_ordered * l.unit_cost), 0)::numeric(12, 2)::text
           as total_value
    from purchase_orders po
    join suppliers s on s.business_id = po.business_id and s.id = po.supplier_id
    left join purchase_order_lines l
      on l.business_id = po.business_id and l.purchase_order_id = po.id
`;

type SummaryRow = {
  id: string;
  order_number: string;
  status: OrderStatus;
  supplier_id: string;
  supplier_name: string;
  expected_delivery_at: string | null;
  ordered_at: Date | null;
  notes: string | null;
  created_at: Date;
  closed_short_at: Date | null;
  close_reason: string | null;
  line_count: number;
  received_lines: number;
  total_value: string;
};

function toSummary(row: SummaryRow): PurchaseOrderSummary {
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    expectedDeliveryAt: row.expected_delivery_at,
    orderedAt: row.ordered_at?.toISOString() ?? null,
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    closedShortAt: row.closed_short_at?.toISOString() ?? null,
    closeReason: row.close_reason,
    lineCount: row.line_count,
    receivedLines: row.received_lines,
    totalValue: row.total_value,
  };
}

function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, "\\$&")}%`;
}

export async function listPurchaseOrders(
  userId: string,
  businessId: string,
  options: { search?: string; status?: string } = {},
  client?: PoolClient,
): Promise<PurchaseOrderSummary[]> {
  const search = options.search?.trim().slice(0, 80) ?? "";
  const status = options.status?.trim() ?? "";

  return runInTenant(userId, client, async (client) => {
    const filters = `
      where po.business_id = $1
        and ($2::text is null or po.order_number ilike $2 or s.name ilike $2)
        and ($3::text is null
             or ($3 = 'open' and po.status in ('ordered', 'partially_received'))
             or po.status = $3)
    `;
    const result = await client.query<SummaryRow>(
      `${SELECT_SUMMARY} ${filters}
        group by po.id, s.name
        order by po.created_at desc, po.order_number desc
        limit 100`,
      [businessId, search === "" ? null : likePattern(search), status || null],
    );
    return result.rows.map(toSummary);
  });
}

export async function getOrderSummary(
  userId: string,
  businessId: string,
  client?: PoolClient,
): Promise<OrderSummary> {
  return runInTenant(userId, client, async (client) => {
    const result = await client.query<{
      total: number;
      awaiting: number;
      drafts: number;
      on_order_value: string;
    }>(
      `select count(*)::int as total,
              count(*) filter (where po.status in ('ordered', 'partially_received'))::int
                as awaiting,
              count(*) filter (where po.status = 'draft')::int as drafts,
              coalesce(sum(
                case when po.status in ('ordered', 'partially_received')
                     then outstanding.value else 0 end
              ), 0)::numeric(12, 2)::text as on_order_value
         from purchase_orders po
         left join lateral (
           select sum((l.quantity_ordered - l.received_quantity) * l.unit_cost)
                    as value
             from purchase_order_lines l
            where l.business_id = po.business_id and l.purchase_order_id = po.id
         ) outstanding on true
        where po.business_id = $1`,
      [businessId],
    );
    const row = result.rows[0];
    return {
      total: row?.total ?? 0,
      awaiting: row?.awaiting ?? 0,
      drafts: row?.drafts ?? 0,
      onOrderValue: row?.on_order_value ?? "0",
    };
  });
}

/**
 * Everything the purchase orders page reads, on one connection: the filtered list
 * and the counts above it.
 */
export async function getPurchaseOrdersPage(
  userId: string,
  businessId: string,
  options: { search?: string; status?: string },
): Promise<{ orders: PurchaseOrderSummary[]; summary: OrderSummary }> {
  return withTenant(userId, async (client) => {
    const [orders, summary] = await Promise.all([
      listPurchaseOrders(userId, businessId, options, client),
      getOrderSummary(userId, businessId, client),
    ]);
    return { orders, summary };
  });
}

/**
 * Everything the order panel reads, on one connection.
 *
 * `edit` only stays `edit` while the order is still a draft; the endpoint used to
 * decide that between two transactions, so the decision lives here with the reads
 * it depends on.
 */
export async function getOrderPanel(
  userId: string,
  businessId: string,
  request: { mode: "create" | "edit" | "detail"; orderId: string },
): Promise<{
  mode: "create" | "edit" | "detail";
  detail: PurchaseOrderDetail | null;
  options: OrderFormOptions | null;
}> {
  return withTenant(userId, async (client) => {
    const detail =
      request.mode === "create" || request.orderId === ""
        ? null
        : await getPurchaseOrder(userId, businessId, request.orderId, client);
    const editingDraft =
      detail !== null &&
      detail.order.status === "draft" &&
      request.mode === "edit";
    const mode =
      request.mode === "create" ? "create" : editingDraft ? "edit" : "detail";
    const options =
      mode === "detail"
        ? null
        : await getOrderFormOptions(userId, businessId, client);
    return { mode, detail, options };
  });
}

export async function getPurchaseOrder(
  userId: string,
  businessId: string,
  orderId: string,
  client?: PoolClient,
): Promise<PurchaseOrderDetail | null> {
  if (!UUID_PATTERN.test(orderId)) return null;

  return runInTenant(userId, client, async (client) => {
    const orderResult = await client.query<SummaryRow>(
      `${SELECT_SUMMARY}
        where po.business_id = $1 and po.id = $2
        group by po.id, s.name`,
      [businessId, orderId],
    );
    const order = orderResult.rows[0];
    if (!order) return null;

    const lines = await client.query<{
      id: string;
      product_id: string;
      product_name: string;
      sku: string;
      unit_of_measure: string;
      quantity_ordered: string;
      quantity_received: string;
      unit_cost: string;
      line_total: string;
    }>(
      `select l.id, l.product_id, p.name as product_name, p.sku,
              p.unit_of_measure, l.quantity_ordered::text as quantity_ordered,
              l.received_quantity::text as quantity_received,
              l.unit_cost::text as unit_cost,
              round(l.quantity_ordered * l.unit_cost, 2)::text as line_total
         from purchase_order_lines l
         join products p
           on p.business_id = l.business_id and p.id = l.product_id
        where l.business_id = $1 and l.purchase_order_id = $2
        order by lower(p.name)`,
      [businessId, orderId],
    );

    const receipts = await client.query<{
      id: string;
      received_at: Date;
      line_count: number;
      quantity: string;
      accepted: string;
      damaged: string;
      rejected: string;
    }>(
      `select r.id, r.received_at, count(rl.id)::int as line_count,
              coalesce(sum(rl.quantity_received), 0)::text as quantity,
              coalesce(sum(rl.quantity_accepted), 0)::text as accepted,
              coalesce(sum(rl.quantity_damaged), 0)::text as damaged,
              coalesce(sum(rl.quantity_rejected), 0)::text as rejected
         from purchase_receipts r
         left join purchase_receipt_lines rl
           on rl.business_id = r.business_id and rl.receipt_id = r.id
        where r.business_id = $1 and r.purchase_order_id = $2
        group by r.id
        order by r.received_at desc
        limit 10`,
      [businessId, orderId],
    );

    return {
      order: toSummary(order),
      lines: lines.rows.map((row) => ({
        id: row.id,
        productId: row.product_id,
        productName: row.product_name,
        sku: row.sku,
        unitOfMeasure: row.unit_of_measure,
        quantityOrdered: row.quantity_ordered,
        quantityReceived: row.quantity_received,
        unitCost: row.unit_cost,
        lineTotal: row.line_total,
      })),
      receipts: receipts.rows.map((row) => ({
        id: row.id,
        receivedAt: row.received_at.toISOString(),
        lineCount: row.line_count,
        quantity: row.quantity,
        accepted: row.accepted,
        damaged: row.damaged,
        rejected: row.rejected,
      })),
    };
  });
}

export async function getOrderFormOptions(
  userId: string,
  businessId: string,
  client?: PoolClient,
): Promise<OrderFormOptions> {
  return runInTenant(userId, client, async (client) => {
    const suppliers = await client.query<{
      id: string;
      name: string;
      lead_time_days: number | null;
    }>(
      `select id, name, lead_time_days from suppliers
        where business_id = $1 and is_archived = false
        order by lower(name)`,
      [businessId],
    );
    const products = await client.query<{
      id: string;
      name: string;
      sku: string;
      unit_of_measure: string;
      cost_price: string;
      supplier_id: string | null;
    }>(
      `select id, name, sku, unit_of_measure, cost_price::text as cost_price,
              supplier_id
         from products
        where business_id = $1 and is_archived = false
        order by lower(name)`,
      [businessId],
    );
    return {
      suppliers: suppliers.rows.map((row) => ({
        id: row.id,
        name: row.name,
        leadTimeDays: row.lead_time_days,
      })),
      products: products.rows.map((row) => ({
        id: row.id,
        name: row.name,
        sku: row.sku,
        unitOfMeasure: row.unit_of_measure,
        costPrice: row.cost_price,
        supplierId: row.supplier_id,
      })),
    };
  });
}

/** "PO-0007" for the next order, based on the numbers already in use. */
async function nextOrderNumber(
  client: PoolClient,
  businessId: string,
): Promise<string> {
  const result = await client.query<{ next: number }>(
    `select coalesce(max(substring(order_number from '([0-9]+)$')::int), 0) + 1
              as next
       from purchase_orders
      where business_id = $1`,
    [businessId],
  );
  return `PO-${String(result.rows[0]?.next ?? 1).padStart(4, "0")}`;
}

async function insertLines(
  client: PoolClient,
  businessId: string,
  orderId: string,
  input: PurchaseOrderInput,
): Promise<void> {
  for (const line of input.lines) {
    await client.query(
      `insert into purchase_order_lines
         (business_id, purchase_order_id, product_id, quantity_ordered, unit_cost)
       values ($1, $2, $3, $4::numeric, $5::numeric)`,
      [businessId, orderId, line.productId, line.quantity, line.unitCost],
    );
  }
}

/**
 * Create a draft. The order and its lines are one `withTenant` transaction, so a
 * rejected line leaves no half-written order behind.
 */
export async function createPurchaseOrder(
  userId: string,
  businessId: string,
  input: PurchaseOrderInput,
): Promise<OrderWriteResult> {
  try {
    return await withTenant(userId, async (client) => {
      const orderNumber = await nextOrderNumber(client, businessId);
      const created = await client.query<{ id: string }>(
        `insert into purchase_orders
           (business_id, supplier_id, order_number, expected_delivery_at, notes)
         values ($1, $2, $3, $4, $5)
         returning id`,
        [
          businessId,
          input.supplierId,
          orderNumber,
          input.expectedDeliveryAt,
          input.notes,
        ],
      );
      const id = created.rows[0]?.id;
      if (!id) return { ok: false as const, error: "The order was not saved." };

      await insertLines(client, businessId, id, input);
      return { ok: true as const, id };
    });
  } catch (error) {
    return describeOrderError(error);
  }
}

/**
 * Replace a draft's details and lines. The `status = 'draft'` predicate and the
 * draft-only policies both refuse an order that has been sent or received.
 */
export async function updateDraftPurchaseOrder(
  userId: string,
  businessId: string,
  orderId: string,
  input: PurchaseOrderInput,
): Promise<OrderWriteResult> {
  if (!UUID_PATTERN.test(orderId)) {
    return { ok: false, error: "That order is not in this business." };
  }

  try {
    return await withTenant(userId, async (client) => {
      const updated = await client.query(
        `update purchase_orders
            set supplier_id = $3, expected_delivery_at = $4, notes = $5,
                updated_at = now()
          where business_id = $1 and id = $2 and status = 'draft'`,
        [
          businessId,
          orderId,
          input.supplierId,
          input.expectedDeliveryAt,
          input.notes,
        ],
      );
      if (updated.rowCount !== 1) {
        return {
          ok: false as const,
          error:
            "Only a draft can be edited. Reload the order to see its state.",
        };
      }

      await client.query(
        "delete from purchase_order_lines where business_id = $1 and purchase_order_id = $2",
        [businessId, orderId],
      );
      await insertLines(client, businessId, orderId, input);
      return { ok: true as const, id: orderId };
    });
  } catch (error) {
    return describeOrderError(error);
  }
}

/** Draft → ordered, or cancellation. The function owns the transition table. */
export async function setPurchaseOrderStatus(
  userId: string,
  businessId: string,
  orderId: string,
  status: "ordered" | "cancelled",
): Promise<OrderActionResult> {
  if (!UUID_PATTERN.test(orderId)) {
    return { ok: false, error: "That order is not in this business." };
  }

  try {
    return await withTenant(userId, async (client) => {
      // Scope the id to this business first; the function re-derives it.
      const owned = await client.query(
        "select id from purchase_orders where business_id = $1 and id = $2",
        [businessId, orderId],
      );
      if (owned.rowCount !== 1) {
        return {
          ok: false as const,
          error: "That order is not in this business.",
        };
      }

      await client.query("select private.set_purchase_order_status($1, $2)", [
        orderId,
        status,
      ]);
      return { ok: true as const };
    });
  } catch (error) {
    return describeActionError(error);
  }
}

/**
 * Close the balance of a partly received order. The lines keep the quantities that
 * actually arrived, and the reason stays with the order so the shortfall has an
 * explanation later.
 */
export async function closePurchaseOrderShort(
  userId: string,
  businessId: string,
  orderId: string,
  reason: string,
): Promise<OrderActionResult> {
  if (!UUID_PATTERN.test(orderId)) {
    return { ok: false, error: "That order is not in this business." };
  }

  try {
    return await withTenant(userId, async (client) => {
      // Scope the id to this business first; the function re-derives it.
      const owned = await client.query(
        "select id from purchase_orders where business_id = $1 and id = $2",
        [businessId, orderId],
      );
      if (owned.rowCount !== 1) {
        return {
          ok: false as const,
          error: "That order is not in this business.",
        };
      }

      await client.query("select private.close_purchase_order_short($1, $2)", [
        orderId,
        reason,
      ]);
      return { ok: true as const };
    });
  } catch (error) {
    return describeActionError(error);
  }
}

/**
 * Receive one delivery. The payload is one entry per line; the database locks the
 * order, refuses over-receipt, writes the receipt, its lines and one stock movement
 * per accepted quantity, then moves the status.
 */
export async function receiveDelivery(
  userId: string,
  businessId: string,
  input: ReceiptInput,
): Promise<ReceiptResult> {
  const payload = JSON.stringify(
    input.lines.map((line) => ({
      purchase_order_line_id: line.lineId,
      received: arrivedQuantity(line),
      accepted: line.accepted,
      damaged: line.damaged,
      rejected: line.rejected,
      reason: line.reason,
    })),
  );

  try {
    return await withTenant(userId, async (client) => {
      const owned = await client.query(
        "select id from purchase_orders where business_id = $1 and id = $2",
        [businessId, input.orderId],
      );
      if (owned.rowCount !== 1) {
        return {
          ok: false as const,
          error: "That order is not in this business.",
        };
      }

      const result = await client.query<{ receipt_id: string; status: string }>(
        `select receipt_id, status
           from private.receive_purchase_order($1, $2::jsonb, $3::uuid)`,
        [input.orderId, payload, input.idempotencyKey],
      );
      const row = result.rows[0];
      if (!row) {
        return {
          ok: false as const,
          error: "The delivery was not recorded.",
        };
      }
      return { ok: true as const, status: row.status as OrderStatus };
    });
  } catch (error) {
    return describeReceiptError(error, userId, businessId, input.orderId);
  }
}

function errorCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

function errorMessage(error: unknown): string | undefined {
  return (error as { message?: string } | null)?.message;
}

function describeOrderError(error: unknown): OrderWriteResult {
  const code = errorCode(error);
  const constraint = (error as { constraint?: string } | null)?.constraint;

  switch (code) {
    case "23505":
      if (constraint === "purchase_orders_one_open_per_supplier") {
        return {
          ok: false,
          error:
            "That supplier already has an open order. Receive or cancel it first.",
        };
      }
      if (constraint === "purchase_order_lines_order_product_key") {
        return {
          ok: false,
          error: "Each product can appear once. Combine the quantities.",
        };
      }
      if (constraint === "purchase_orders_business_number_key") {
        return {
          ok: false,
          error: "Another order was saved at the same moment. Try again.",
        };
      }
      return { ok: false, error: "That order conflicts with an existing one." };
    case "23503":
      return {
        ok: false,
        error: "That supplier or product is not in this business.",
      };
    case "42501":
      return {
        ok: false,
        error: "You do not have permission to change orders in this business.",
      };
    case "23514":
      return {
        ok: false,
        error: "A line is outside the quantity or cost the order allows.",
      };
    default:
      throw error;
  }
}

function describeActionError(error: unknown): OrderActionResult {
  const code = errorCode(error);

  switch (code) {
    case "22023":
      return {
        ok: false,
        error: errorMessage(error) ?? "That change is not allowed.",
      };
    case "42501":
      return {
        ok: false,
        error: "You do not have permission to change orders in this business.",
      };
    case "P0002":
      return { ok: false, error: "That order is not in this business." };
    default:
      throw error;
  }
}

async function describeReceiptError(
  error: unknown,
  userId: string,
  businessId: string,
  orderId: string,
): Promise<ReceiptResult> {
  const code = errorCode(error);

  switch (code) {
    case "22023":
    case "23514":
      // The function's own raised messages are written for the operator: they name
      // the outstanding quantity and the product.
      return {
        ok: false,
        error: errorMessage(error) ?? "That delivery was rejected.",
      };
    case "22P02":
    case "22003":
      return {
        ok: false,
        error:
          "That delivery could not be read. Reload the order and try again.",
      };
    case "42501":
      return {
        ok: false,
        error: "You do not have permission to receive stock in this business.",
      };
    case "P0002":
      return { ok: false, error: "That order is not in this business." };
    case "23505": {
      // A concurrent duplicate of the same submission won the unique key; the
      // delivery was recorded once, so report the order's state rather than an error.
      const status = await withTenant(userId, async (client) => {
        const result = await client.query<{ status: OrderStatus }>(
          "select status from purchase_orders where business_id = $1 and id = $2",
          [businessId, orderId],
        );
        return result.rows[0]?.status ?? "ordered";
      });
      return { ok: true, status };
    }
    default:
      throw error;
  }
}
