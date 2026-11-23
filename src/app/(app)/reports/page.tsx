import { PendingLink } from "@/components/pending-link";
import type { ReactNode } from "react";
import { NoBusinessNotice } from "@/components/no-business-notice";
import { Pagination } from "@/components/pagination";
import { ReportFilters } from "@/components/reports/report-filters";
import { ReportTabs } from "@/components/reports/report-tabs";
import {
  MovementReportTable,
  OrderReportTable,
  StockReportTable,
  ValuationReportTable,
} from "@/components/reports/report-tables";
import { getActiveBusiness } from "@/lib/businesses";
import { formatMoney } from "@/lib/product-input";
import {
  REPORT_LABELS,
  REPORT_NOTES,
  REPORT_PAGE_SIZE,
  parseMovementTypeFilter,
  parseOrderReportStatus,
  parseReportDate,
  parseReportKind,
  reportExportHref,
  reportHref,
  reportStatusFor,
  type ReportFilters as Filters,
  type ReportKind,
} from "@/lib/report-input";
import {
  getMovementReport,
  getOrderStatusReport,
  getStockReport,
  getValuationReport,
} from "@/lib/reports";
import { getSessionUser } from "@/lib/session";

type SearchParams = Record<string, string | string[] | undefined>;

function single(params: SearchParams, key: string): string {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

/**
 * Reports: the five views an owner keeps on hand — stock, shortages, the ledger,
 * order status and valuation — each filterable from the URL, and each exportable
 * to CSV with the same filters applied.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const user = await getSessionUser();
  if (!user) return null;

  const { active } = await getActiveBusiness(user.id);
  if (!active) return <NoBusinessNotice />;

  const canViewValues = active.role !== "viewer";
  const kind = parseReportKind(single(params, "report"));
  const q = single(params, "q").trim().slice(0, 80);
  const status = reportStatusFor(kind, single(params, "status"));
  const orderStatus = parseOrderReportStatus(single(params, "status"));
  const movementType = parseMovementTypeFilter(single(params, "type"));
  let from = parseReportDate(single(params, "from"));
  let to = parseReportDate(single(params, "to"));
  if (from && to && from > to) {
    [from, to] = [to, from];
  }

  const requestedPage = Number.parseInt(single(params, "page"), 10);
  const page =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const filters: Filters = {
    q,
    status,
    orderStatus,
    movementType,
    from,
    to,
    page,
  };

  let body: ReactNode = null;
  let summaryText = "";
  let total = 0;
  let pageCount = 1;

  if (kind === "stock" || kind === "low") {
    const report = await getStockReport(user.id, active.id, {
      search: q,
      status,
      page,
      pageSize: REPORT_PAGE_SIZE,
    });
    total = report.total;
    pageCount = Math.max(1, Math.ceil(total / REPORT_PAGE_SIZE));
    summaryText =
      kind === "low"
        ? `${total} product${total === 1 ? "" : "s"} at or below the reorder level`
        : `${total} product${total === 1 ? "" : "s"}${
            status === "all" ? "" : " matching"
          }`;
    body =
      report.rows.length > 0 ? (
        <StockReportTable
          rows={report.rows}
          currency={active.currencyCode}
          canViewValues={canViewValues}
        />
      ) : (
        <EmptyReport
          title={
            kind === "low" ? "No shortages" : "No products match those filters"
          }
          body={
            kind === "low"
              ? "Every active product is above its reorder level. New shortages appear here as soon as stock crosses it."
              : "Clear the search or the status filter, or check that products exist in the catalogue."
          }
          href={kind === "low" ? "/inventory" : "/reports?report=stock"}
          label={kind === "low" ? "Open inventory" : "Clear filters"}
        />
      );
  } else if (kind === "movements") {
    const report = await getMovementReport(user.id, active.id, {
      search: q,
      movementType,
      from,
      to,
      page,
      pageSize: REPORT_PAGE_SIZE,
    });
    total = report.total;
    pageCount = Math.max(1, Math.ceil(total / REPORT_PAGE_SIZE));
    summaryText = `${total} movement${total === 1 ? "" : "s"}${
      from || to ? " in the chosen dates" : ""
    }`;
    body =
      report.rows.length > 0 ? (
        <MovementReportTable rows={report.rows} />
      ) : (
        <EmptyReport
          title="No movements match those filters"
          body="Widen the dates, choose another type, or clear the search. Receiving an order or recording stock in adds a line here."
          href="/reports?report=movements"
          label="Clear filters"
        />
      );
  } else if (kind === "orders") {
    const report = await getOrderStatusReport(user.id, active.id, {
      search: q,
      status: orderStatus,
      page,
      pageSize: REPORT_PAGE_SIZE,
    });
    total = report.total;
    pageCount = Math.max(1, Math.ceil(total / REPORT_PAGE_SIZE));
    summaryText = `${total} order${total === 1 ? "" : "s"}`;
    body =
      report.rows.length > 0 ? (
        <OrderReportTable
          rows={report.rows}
          currency={active.currencyCode}
          canViewValues={canViewValues}
        />
      ) : (
        <EmptyReport
          title="No orders match those filters"
          body="Clear the search or status, or create an order from the purchase orders screen."
          href="/purchase-orders"
          label="Open purchase orders"
        />
      );
  } else {
    const report = await getValuationReport(user.id, active.id);
    total = report.rows.length;
    summaryText = `${report.totalProducts} product${
      report.totalProducts === 1 ? "" : "s"
    }${
      canViewValues
        ? ` · ${formatMoney(report.totalValue, active.currencyCode)} at cost`
        : ""
    }`;
    body =
      report.rows.length > 0 ? (
        <ValuationReportTable
          report={report}
          currency={active.currencyCode}
          canViewValues={canViewValues}
        />
      ) : (
        <EmptyReport
          title="Nothing to value yet"
          body="Add products with a cost price and opening stock; their value appears here by category."
          href="/products"
          label="Open products"
        />
      );
  }

  const filtered =
    q !== "" ||
    (kind === "stock" && status !== "all") ||
    (kind === "movements" &&
      (movementType !== "all" || from !== "" || to !== "")) ||
    (kind === "orders" && orderStatus !== "all");

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.08em] text-ink-muted">
            Reports
          </p>
          <h1 className="mt-0.5 text-[15px] font-semibold tracking-tight">
            {REPORT_LABELS[kind]}
          </h1>
          <p className="text-[12px] text-ink-muted">
            {REPORT_NOTES[kind]} · {active.name}
          </p>
        </div>
        {canViewValues ? (
          <a
            href={reportExportHref(kind, { ...filters, page: 1 })}
            className="ml-auto inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-3 text-[12px] font-medium hover:border-accent hover:text-accent"
          >
            Export CSV
          </a>
        ) : null}
      </header>

      <ReportTabs kind={kind} />

      <ReportFilters kind={kind} filters={filters} />

      <p className="text-[12px] text-ink-muted">
        {summaryText}
        {filtered ? " · filtered" : ""}
      </p>

      {body}

      <ReportPagination
        kind={kind}
        filters={filters}
        page={page}
        pageCount={pageCount}
      />
    </section>
  );
}

function ReportPagination({
  kind,
  filters,
  page,
  pageCount,
}: {
  kind: ReportKind;
  filters: Filters;
  page: number;
  pageCount: number;
}) {
  return (
    <Pagination
      page={page}
      pageCount={pageCount}
      previousHref={
        page > 1 ? reportHref(kind, { ...filters, page: page - 1 }) : undefined
      }
      nextHref={
        page < pageCount
          ? reportHref(kind, { ...filters, page: page + 1 })
          : undefined
      }
    />
  );
}

function EmptyReport({
  title,
  body,
  href,
  label,
}: {
  title: string;
  body: string;
  href: string;
  label: string;
}) {
  return (
    <div className="rounded border border-dashed border-line bg-panel px-4 py-12 text-center">
      <p className="text-[13px] font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-[52ch] text-[12px] text-ink-muted">
        {body}
      </p>
      <PendingLink
        href={href}
        className="mt-4 inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-3 text-[12px] font-medium hover:border-accent hover:text-accent"
      >
        {label}
      </PendingLink>
    </div>
  );
}
