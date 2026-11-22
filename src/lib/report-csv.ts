import { stockStatus } from "./product-input";
import { ORDER_LABELS } from "./purchase-order-input";
import { LEDGER_MOVEMENT_LABELS } from "./stock-input";
import type {
  MovementReportRow,
  OrderReportRow,
  StockReportRow,
  ValuationReport,
} from "./reports";
import type { ReportKind } from "./report-input";

/**
 * CSV shapes, kept apart from the tables so the two can differ where they should:
 * the screen formats money and dates for reading, the file carries plain numbers
 * and ISO dates a spreadsheet can add up.
 */

export const REPORT_CSV_HEADERS: Record<ReportKind, string[]> = {
  stock: [
    "Product",
    "SKU",
    "Category",
    "Supplier",
    "Unit",
    "On hand",
    "Reorder level",
    "On order",
    "Unit cost",
    "Stock value",
    "Status",
  ],
  low: [
    "Product",
    "SKU",
    "Category",
    "Supplier",
    "Unit",
    "On hand",
    "Reorder level",
    "On order",
    "Unit cost",
    "Stock value",
    "Status",
  ],
  movements: [
    "Date",
    "Product",
    "SKU",
    "Type",
    "Quantity",
    "Unit",
    "Reason",
    "Reference",
  ],
  orders: [
    "Order",
    "Supplier",
    "Status",
    "Ordered",
    "Expected",
    "Lines received",
    "Lines",
    "Value",
    "Outstanding value",
  ],
  valuation: ["Category", "Products", "Value at cost"],
};

function day(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

export function stockCsvRows(rows: StockReportRow[]): (string | number)[][] {
  return rows.map((row) => [
    row.name,
    row.sku,
    row.categoryName ?? "",
    row.supplierName ?? "",
    row.unitOfMeasure,
    Number(row.onHand),
    Number(row.reorderLevel),
    Number(row.onOrder),
    Number(row.unitCost),
    Number(row.stockValue),
    stockStatus(row.onHand, row.reorderLevel),
  ]);
}

export function movementCsvRows(
  rows: MovementReportRow[],
): (string | number)[][] {
  return rows.map((row) => [
    day(row.createdAt),
    row.productName,
    row.sku,
    LEDGER_MOVEMENT_LABELS[row.movementType],
    Number(row.quantityDelta),
    row.unitOfMeasure,
    row.reason ?? "",
    row.referenceType === "purchase_receipt"
      ? "Receipt"
      : (row.referenceType ?? ""),
  ]);
}

export function orderCsvRows(rows: OrderReportRow[]): (string | number)[][] {
  return rows.map((row) => [
    row.orderNumber,
    row.supplierName,
    ORDER_LABELS[row.status],
    day(row.orderedAt),
    row.expectedDeliveryAt ?? "",
    row.receivedLines,
    row.lineCount,
    Number(row.totalValue),
    Number(row.outstandingValue),
  ]);
}

export function valuationCsvRows(
  report: ValuationReport,
): (string | number)[][] {
  return [
    ...report.rows.map((row) => [
      row.categoryName,
      row.products,
      Number(row.value),
    ]),
    ["Total", report.totalProducts, Number(report.totalValue)],
  ];
}
