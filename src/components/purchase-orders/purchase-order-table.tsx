import { formatMoney } from "@/lib/product-input";
import type { PurchaseOrderSummary } from "@/lib/purchase-orders";
import { PanelLink } from "../panel-link";
import { OrderStatusLabel } from "./order-status-label";

const TH =
  "px-2.5 py-1.5 text-left text-[10px] font-medium uppercase tracking-[0.07em] text-ink-muted";
const TD = "px-2.5 py-1.5 align-middle";

/** "24 Nov", so the list stays a single line. The panel shows the full date. */
function formatDay(value: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
  }).format(date);
}

/**
 * Dense order table. The progress column is the useful one at a glance: how many
 * lines still owe stock, not how many rows the order has.
 */
export function PurchaseOrderTable({
  orders,
  currency,
  rowHref,
  canViewValues = true,
}: {
  orders: PurchaseOrderSummary[];
  currency: string;
  rowHref: (orderId: string) => string;
  /** Viewers do not receive order values. */
  canViewValues?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded border border-line bg-surface">
      <table className="w-full min-w-[760px] border-collapse text-[13px]">
        <caption className="sr-only">
          Purchase orders, with supplier, status, received lines, value and
          expected delivery
        </caption>
        <thead className="border-b border-line bg-panel">
          <tr>
            <th scope="col" className={TH}>
              Order
            </th>
            <th scope="col" className={TH}>
              Supplier
            </th>
            <th scope="col" className={TH}>
              Status
            </th>
            <th scope="col" className={TH}>
              Lines
            </th>
            {canViewValues ? (
              <th scope="col" className={`${TH} text-right`}>
                Value
              </th>
            ) : null}
            <th scope="col" className={TH}>
              Expected
            </th>
          </tr>
        </thead>
        <tbody data-rows>
          {orders.map((order) => {
            const progress =
              order.status === "received"
                ? "all received"
                : `${order.receivedLines} of ${order.lineCount}`;
            return (
              <tr
                key={order.id}
                className="border-b border-line last:border-b-0 hover:bg-panel"
              >
                <td className={`${TD} border-l-2 border-transparent`}>
                  {/* The open row is marked by the link's own state, because the
                      panel opens without a page render. */}
                  <PanelLink
                    href={rowHref(order.id)}
                    className="font-mono font-medium hover:text-accent"
                  >
                    {order.orderNumber}
                  </PanelLink>
                </td>
                <td className={`${TD} text-ink-muted`}>{order.supplierName}</td>
                <td className={`${TD} text-ink-muted`}>
                  <OrderStatusLabel status={order.status} />
                </td>
                <td className={`${TD} font-mono text-[12px] text-ink-muted`}>
                  {progress}
                </td>
                {canViewValues ? (
                  <td className={`${TD} text-right font-mono`}>
                    {formatMoney(order.totalValue, currency)}
                  </td>
                ) : null}
                <td className={`${TD} text-ink-muted`}>
                  {formatDay(order.expectedDeliveryAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
        {/* Shown by `[data-busy="true"]` while a filter or pager change is in
            flight, so the rows are replaced in place instead of the page. */}
        <tbody
          data-skeleton
          aria-hidden
          className="animate-pulse motion-reduce:animate-none"
        >
          {Array.from({ length: 8 }, (_, row) => (
            <tr key={row} className="border-b border-line last:border-b-0">
              {Array.from({ length: canViewValues ? 6 : 5 }, (_, column) => (
                <td key={column} className={TD}>
                  <span
                    className={`block h-3 rounded bg-line ${
                      column === 0 ? "w-32" : "w-10"
                    }`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
