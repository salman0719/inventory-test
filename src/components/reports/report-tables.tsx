import { formatMoney, formatQuantity, stockStatus } from "@/lib/product-input";
import {
  LEDGER_MOVEMENT_LABELS,
  formatSignedQuantity,
} from "@/lib/stock-input";
import type {
  MovementReportRow,
  OrderReportRow,
  StockReportRow,
  ValuationReport,
} from "@/lib/reports";
import { StatusLabel } from "@/components/products/status-label";
import { OrderStatusLabel } from "@/components/purchase-orders/order-status-label";

const TH =
  "px-2.5 py-1.5 text-left text-[10px] font-medium uppercase tracking-[0.07em] text-ink-muted";
const TD = "px-2.5 py-1.5 align-middle";

function formatDay(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatMoment(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

/** Receipts are the only reference the ledger writes today; name it in words. */
function referenceLabel(referenceType: string | null): string {
  if (!referenceType) return "—";
  if (referenceType === "purchase_receipt") return "Receipt";
  return referenceType.replace(/_/g, " ");
}

export function StockReportTable({
  rows,
  currency,
  canViewValues = true,
}: {
  rows: StockReportRow[];
  currency: string;
  /** Viewers do not receive unit cost or value at cost. */
  canViewValues?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded border border-line bg-surface">
      <table className="w-full min-w-[920px] border-collapse text-[13px]">
        <caption className="sr-only">
          Products with on-hand, reorder level, stock on order, unit cost, value
          at cost and stock status
        </caption>
        <thead className="border-b border-line bg-panel">
          <tr>
            <th scope="col" className={TH}>
              Product
            </th>
            <th scope="col" className={TH}>
              Category
            </th>
            <th scope="col" className={TH}>
              Supplier
            </th>
            <th scope="col" className={`${TH} text-right`}>
              On hand
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Reorder
            </th>
            <th scope="col" className={`${TH} text-right`}>
              On order
            </th>
            {canViewValues ? (
              <>
                <th scope="col" className={`${TH} text-right`}>
                  Cost
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Value
                </th>
              </>
            ) : null}
            <th scope="col" className={TH}>
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-line last:border-b-0 hover:bg-panel"
            >
              <td className={`${TD} border-l-2 border-transparent`}>
                <span className="font-medium">{row.name}</span>
                <span className="ml-2 font-mono text-[11px] text-ink-faint">
                  {row.sku}
                </span>
              </td>
              <td className={`${TD} text-ink-muted`}>
                {row.categoryName ?? "—"}
              </td>
              <td className={`${TD} text-ink-muted`}>
                {row.supplierName ?? "—"}
              </td>
              <td className={`${TD} text-right font-mono`}>
                {formatQuantity(row.onHand)}
                <span className="ml-1 text-[11px] text-ink-faint">
                  {row.unitOfMeasure}
                </span>
              </td>
              <td className={`${TD} text-right font-mono text-ink-muted`}>
                {formatQuantity(row.reorderLevel)}
              </td>
              <td
                className={`${TD} text-right font-mono ${
                  Number(row.onOrder) > 0 ? "text-accent" : "text-ink-faint"
                }`}
              >
                {Number(row.onOrder) > 0 ? formatQuantity(row.onOrder) : "—"}
              </td>
              {canViewValues ? (
                <>
                  <td className={`${TD} text-right font-mono text-ink-muted`}>
                    {formatMoney(row.unitCost, currency)}
                  </td>
                  <td className={`${TD} text-right font-mono`}>
                    {formatMoney(row.stockValue, currency)}
                  </td>
                </>
              ) : null}
              <td className={`${TD} text-ink-muted`}>
                <StatusLabel
                  status={stockStatus(row.onHand, row.reorderLevel)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MovementReportTable({ rows }: { rows: MovementReportRow[] }) {
  return (
    <div className="overflow-x-auto rounded border border-line bg-surface">
      <table className="w-full min-w-[820px] border-collapse text-[13px]">
        <caption className="sr-only">
          Stock movements with date, product, type, quantity, reason and
          reference
        </caption>
        <thead className="border-b border-line bg-panel">
          <tr>
            <th scope="col" className={TH}>
              Date
            </th>
            <th scope="col" className={TH}>
              Product
            </th>
            <th scope="col" className={TH}>
              Type
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Quantity
            </th>
            <th scope="col" className={TH}>
              Reason
            </th>
            <th scope="col" className={TH}>
              Reference
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-line last:border-b-0 hover:bg-panel"
            >
              <td
                className={`${TD} border-l-2 border-transparent font-mono text-[11px] text-ink-faint`}
              >
                {formatMoment(row.createdAt)}
              </td>
              <td className={TD}>
                <span>{row.productName}</span>
                <span className="ml-2 font-mono text-[11px] text-ink-faint">
                  {row.sku}
                </span>
              </td>
              <td className={`${TD} text-ink-muted`}>
                {LEDGER_MOVEMENT_LABELS[row.movementType]}
              </td>
              <td
                className={`${TD} text-right font-mono ${
                  Number(row.quantityDelta) < 0 ? "text-danger" : "text-success"
                }`}
              >
                {formatSignedQuantity(row.quantityDelta)}
                <span className="ml-1 text-[11px] text-ink-faint">
                  {row.unitOfMeasure}
                </span>
              </td>
              <td className={`${TD} max-w-[280px] truncate text-ink-muted`}>
                {row.reason ?? "—"}
              </td>
              <td className={`${TD} text-ink-muted`}>
                {referenceLabel(row.referenceType)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OrderReportTable({
  rows,
  currency,
  canViewValues = true,
}: {
  rows: OrderReportRow[];
  currency: string;
  /** Viewers do not receive order or outstanding values. */
  canViewValues?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded border border-line bg-surface">
      <table className="w-full min-w-[920px] border-collapse text-[13px]">
        <caption className="sr-only">
          Purchase orders with supplier, status, dates, received lines, value
          and outstanding value
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
              Ordered
            </th>
            <th scope="col" className={TH}>
              Expected
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Lines
            </th>
            {canViewValues ? (
              <>
                <th scope="col" className={`${TH} text-right`}>
                  Value
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Outstanding
                </th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-line last:border-b-0 hover:bg-panel"
            >
              <td
                className={`${TD} border-l-2 border-transparent font-mono font-medium`}
              >
                {row.orderNumber}
              </td>
              <td className={`${TD} text-ink-muted`}>{row.supplierName}</td>
              <td className={`${TD} text-ink-muted`}>
                <OrderStatusLabel status={row.status} />
              </td>
              <td className={`${TD} text-ink-muted`}>
                {formatDay(row.orderedAt)}
              </td>
              <td className={`${TD} text-ink-muted`}>
                {formatDay(row.expectedDeliveryAt)}
              </td>
              <td
                className={`${TD} text-right font-mono text-[12px] text-ink-muted`}
              >
                {row.receivedLines} of {row.lineCount}
              </td>
              {canViewValues ? (
                <>
                  <td className={`${TD} text-right font-mono`}>
                    {formatMoney(row.totalValue, currency)}
                  </td>
                  <td
                    className={`${TD} text-right font-mono ${
                      Number(row.outstandingValue) > 0
                        ? "text-warning"
                        : "text-ink-faint"
                    }`}
                  >
                    {Number(row.outstandingValue) > 0
                      ? formatMoney(row.outstandingValue, currency)
                      : "—"}
                  </td>
                </>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ValuationReportTable({
  report,
  currency,
  canViewValues = true,
}: {
  report: ValuationReport;
  currency: string;
  canViewValues?: boolean;
}) {
  const totalCents = Math.round(Number(report.totalValue) * 100);

  if (!canViewValues) {
    return (
      <div className="rounded border border-dashed border-line bg-panel px-4 py-12 text-center">
        <p className="text-[13px] font-medium">
          Stock value is hidden for your role
        </p>
        <p className="mx-auto mt-1 max-w-[46ch] text-[12px] text-ink-muted">
          Valuation is visible to owners and staff. The stock and movements
          reports still show quantities.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded border border-line bg-surface">
      <table className="w-full min-w-[520px] border-collapse text-[13px]">
        <caption className="sr-only">
          Stock value at cost by category, with each category&rsquo;s share of
          the total
        </caption>
        <thead className="border-b border-line bg-panel">
          <tr>
            <th scope="col" className={TH}>
              Category
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Products
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Value at cost
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Share
            </th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row) => {
            const share =
              totalCents === 0
                ? 0
                : (Math.round(Number(row.value) * 100) / totalCents) * 100;
            return (
              <tr
                key={row.categoryName}
                className="border-b border-line last:border-b-0 hover:bg-panel"
              >
                <td className={`${TD} border-l-2 border-transparent`}>
                  {row.categoryName}
                </td>
                <td className={`${TD} text-right font-mono text-ink-muted`}>
                  {row.products}
                </td>
                <td className={`${TD} text-right font-mono`}>
                  {formatMoney(row.value, currency)}
                </td>
                <td className={`${TD} text-right font-mono text-ink-muted`}>
                  {share.toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-line bg-panel">
            <th scope="row" className={`${TH} text-ink`}>
              Total
            </th>
            <td className={`${TD} text-right font-mono`}>
              {report.totalProducts}
            </td>
            <td className={`${TD} text-right font-mono font-medium`}>
              {formatMoney(report.totalValue, currency)}
            </td>
            <td className={`${TD} text-right font-mono text-ink-muted`}>
              100%
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
