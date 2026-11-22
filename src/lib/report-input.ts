import { LEDGER_MOVEMENT_LABELS } from "./stock-input";

/**
 * Report vocabulary and URL state, shared by the screens, the CSV export and the
 * unit tests.
 *
 * Filters arrive from the URL, so each parser accepts anything and falls back to
 * the safe default. None of them accepts a business id: that comes from the
 * session.
 */

export const REPORT_KINDS = [
  "stock",
  "low",
  "movements",
  "orders",
  "valuation",
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_LABELS: Record<ReportKind, string> = {
  stock: "Stock on hand",
  low: "Low stock",
  movements: "Movements",
  orders: "Order status",
  valuation: "Valuation",
};

export const REPORT_NOTES: Record<ReportKind, string> = {
  stock: "Every active product with its position, cost and value at cost.",
  low: "Products at or below their reorder level, out of stock first.",
  movements: "Every ledger line in the period, newest first.",
  orders: "Purchase orders with received lines and the value still owing.",
  valuation: "Stock value at cost, grouped by category.",
};

export function parseReportKind(value: string | undefined | null): ReportKind {
  return REPORT_KINDS.find((kind) => kind === value) ?? "stock";
}

export const REPORT_STATUSES = [
  "all",
  "attention",
  "low",
  "out",
  "ok",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  all: "All stock",
  attention: "Low or out",
  low: "Low",
  out: "Out",
  ok: "In stock",
};

export function parseReportStatus(
  value: string | undefined | null,
): ReportStatus {
  return REPORT_STATUSES.find((status) => status === value) ?? "all";
}

/** The low-stock report is the same query as stock, always filtered to shortages. */
export function reportStatusFor(
  kind: ReportKind,
  value: string | undefined | null,
): ReportStatus {
  return kind === "low" ? "attention" : parseReportStatus(value);
}

export const ORDER_REPORT_STATUSES = [
  "all",
  "open",
  "draft",
  "ordered",
  "partially_received",
  "received",
  "cancelled",
] as const;
export type OrderReportStatus = (typeof ORDER_REPORT_STATUSES)[number];

export const ORDER_REPORT_STATUS_LABELS: Record<OrderReportStatus, string> = {
  all: "All orders",
  open: "Awaiting delivery",
  draft: "Drafts",
  ordered: "Ordered",
  partially_received: "Partly received",
  received: "Received",
  cancelled: "Cancelled",
};

export function parseOrderReportStatus(
  value: string | undefined | null,
): OrderReportStatus {
  return ORDER_REPORT_STATUSES.find((status) => status === value) ?? "all";
}

export const MOVEMENT_TYPE_FILTERS = [
  "all",
  "opening",
  "received",
  "stock_in",
  "stock_out",
  "adjustment",
] as const;
export type MovementTypeFilter = (typeof MOVEMENT_TYPE_FILTERS)[number];

export function parseMovementTypeFilter(
  value: string | undefined | null,
): MovementTypeFilter {
  return MOVEMENT_TYPE_FILTERS.find((type) => type === value) ?? "all";
}

export function movementTypeLabel(type: MovementTypeFilter): string {
  return type === "all" ? "All types" : LEDGER_MOVEMENT_LABELS[type];
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A calendar date from the URL, or "" — never "2026-02-30". */
export function parseReportDate(value: string | undefined | null): string {
  if (!value || !DATE_PATTERN.test(value)) return "";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10) === value ? value : "";
}

export type ReportFilters = {
  q: string;
  status: ReportStatus;
  orderStatus: OrderReportStatus;
  movementType: MovementTypeFilter;
  from: string;
  to: string;
  page: number;
};

export const REPORT_PAGE_SIZE = 50;

/**
 * The query behind both the page and its export, so a downloaded file always
 * contains exactly what the screen was showing.
 */
export function reportQuery(kind: ReportKind, filters: ReportFilters): string {
  const params = new URLSearchParams();
  params.set("report", kind);
  if (filters.q) params.set("q", filters.q);

  if (kind === "stock" && filters.status !== "all") {
    params.set("status", filters.status);
  }
  if (kind === "orders" && filters.orderStatus !== "all") {
    params.set("status", filters.orderStatus);
  }
  if (kind === "movements") {
    if (filters.movementType !== "all")
      params.set("type", filters.movementType);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
  }
  if (filters.page > 1) params.set("page", String(filters.page));

  return params.toString();
}

export function reportHref(kind: ReportKind, filters: ReportFilters): string {
  return `/reports?${reportQuery(kind, filters)}`;
}

export function reportExportHref(
  kind: ReportKind,
  filters: ReportFilters,
): string {
  return `/reports/export?${reportQuery(kind, { ...filters, page: 1 })}`;
}
