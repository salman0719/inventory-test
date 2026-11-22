import Link from "next/link";
import type { ReactNode } from "react";
import { formatMoney, formatQuantity } from "@/lib/product-input";
import { canReceive, outstandingQuantity } from "@/lib/purchase-order-input";
import type { PurchaseOrderDetail } from "@/lib/purchase-orders";
import { OrderActions } from "./order-actions";
import { OrderStatusLabel } from "./order-status-label";
import { ReceiveForm, type ReceivableLine } from "./receive-form";

const BUTTON =
  "inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-2.5 text-[12px] font-medium hover:border-accent hover:text-accent";

/** What just happened, in the operator's words rather than the status code. */
const SAVED_MESSAGES: Record<string, string> = {
  true: "Draft saved.",
  ordered: "Marked as ordered. Receive it as stock arrives.",
  cancelled: "Order cancelled.",
  partially_received: "Part received. The rest stays outstanding.",
  received: "Delivery received. Stock and the order are updated.",
};

function formatMoment(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDay(value: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium" }).format(date);
}

/**
 * One order: what was ordered, what has arrived, the one control that receives a
 * delivery, and the receipt history. Every number here is derived from the lines
 * and the ledger, so this panel can explain the stock position it created.
 */
export function PurchaseOrderPanel({
  detail,
  currency,
  saved,
  closeHref,
  editHref,
  idempotencyKey,
  canViewValues = true,
}: {
  detail: PurchaseOrderDetail;
  currency: string;
  saved: string;
  closeHref: string;
  editHref: string;
  idempotencyKey: string;
  /** Viewers see what was ordered, not what it cost, and cannot receive. */
  canViewValues?: boolean;
}) {
  const { order, lines, receipts } = detail;

  const receivable: ReceivableLine[] = canReceive(order.status)
    ? lines
        .map((line) => ({
          id: line.id,
          productName: line.productName,
          unitOfMeasure: line.unitOfMeasure,
          outstanding: outstandingQuantity(
            line.quantityOrdered,
            line.quantityReceived,
          ),
        }))
        .filter((line) => line.outstanding > 0)
    : [];

  const message = SAVED_MESSAGES[saved] ?? "";

  return (
    <aside
      aria-label="Purchase order details"
      className="rounded border border-line bg-surface"
    >
      <header className="flex items-start gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0">
          <h2 className="truncate font-mono text-[13px] font-semibold">
            {order.orderNumber}
          </h2>
          <p className="truncate text-[11px] text-ink-muted">
            {order.supplierName}
          </p>
        </div>
        <Link
          href={closeHref}
          aria-label="Close order panel"
          className={`${BUTTON} ml-auto shrink-0`}
        >
          Close
        </Link>
      </header>

      {message !== "" ? (
        <p
          role="status"
          className={`border-b border-line px-3 py-1.5 text-[12px] ${
            saved === "cancelled"
              ? "bg-warning-soft text-warning"
              : "bg-success-soft text-success"
          }`}
        >
          {message}
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-3">
        <Value label="Status">
          <OrderStatusLabel status={order.status} />
        </Value>
        {canViewValues ? (
          <Value label="Value">
            <span className="font-mono">
              {formatMoney(order.totalValue, currency)}
            </span>
          </Value>
        ) : null}
        <Value label="Ordered">
          {order.orderedAt ? formatMoment(order.orderedAt) : "Not yet sent"}
        </Value>
        <Value label="Expected">{formatDay(order.expectedDeliveryAt)}</Value>
        {order.notes ? (
          <div className="col-span-2 min-w-0">
            <dt className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
              Notes
            </dt>
            <dd className="whitespace-pre-wrap text-[12px]">{order.notes}</dd>
          </div>
        ) : null}
      </dl>

      {order.status === "draft" && canViewValues ? (
        <div className="flex items-center gap-2 border-t border-line px-3 py-2">
          <Link href={editHref} className={BUTTON}>
            Edit draft
          </Link>
          <span className="text-[11px] text-ink-muted">
            A draft is not visible to the supplier yet.
          </span>
        </div>
      ) : null}

      {canViewValues &&
      (order.status === "draft" || canReceive(order.status)) ? (
        <OrderActions orderId={order.id} status={order.status} />
      ) : null}

      <div className="border-t border-line px-3 py-2">
        <h3 className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
          Lines
        </h3>
        <div className="mt-1 overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-line text-left text-[10px] uppercase tracking-[0.06em] text-ink-muted">
                <th scope="col" className="py-1 pr-2 font-medium">
                  Product
                </th>
                <th scope="col" className="py-1 pr-2 text-right font-medium">
                  Ordered
                </th>
                <th scope="col" className="py-1 pr-2 text-right font-medium">
                  In
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Due
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const outstanding = outstandingQuantity(
                  line.quantityOrdered,
                  line.quantityReceived,
                );
                return (
                  <tr
                    key={line.id}
                    className="border-b border-line last:border-b-0"
                  >
                    <td className="min-w-0 py-1 pr-2">
                      <span className="block truncate">{line.productName}</span>
                      {canViewValues ? (
                        <span className="block text-[10.5px] text-ink-faint">
                          {formatMoney(line.unitCost, currency)} /{" "}
                          {line.unitOfMeasure}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1 pr-2 text-right font-mono">
                      {formatQuantity(line.quantityOrdered)}
                    </td>
                    <td className="py-1 pr-2 text-right font-mono text-ink-muted">
                      {formatQuantity(line.quantityReceived)}
                    </td>
                    <td
                      className={`py-1 text-right font-mono ${
                        outstanding > 0 ? "text-warning" : "text-ink-faint"
                      }`}
                    >
                      {formatQuantity(outstanding)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {canViewValues && receivable.length > 0 ? (
        <div className="border-t border-line px-3 py-3">
          <h3 className="mb-1.5 text-[10px] uppercase tracking-[0.07em] text-ink-muted">
            Receive a delivery
          </h3>
          <ReceiveForm
            orderId={order.id}
            idempotencyKey={idempotencyKey}
            lines={receivable}
          />
        </div>
      ) : null}

      <div className="border-t border-line px-3 py-2">
        <h3 className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
          Deliveries
        </h3>
        {receipts.length === 0 ? (
          <p className="mt-1 text-[12px] text-ink-muted">
            Nothing received on this order yet.
          </p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {receipts.map((receipt) => (
              <li
                key={receipt.id}
                className="flex items-baseline gap-2 text-[12px]"
              >
                <span className="text-ink-muted">
                  {formatMoment(receipt.receivedAt)}
                </span>
                <span className="ml-auto text-[11px] text-ink-faint">
                  {receipt.lineCount} line{receipt.lineCount === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function Value({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
        {label}
      </dt>
      <dd className="truncate text-[13px]">{children}</dd>
    </div>
  );
}
