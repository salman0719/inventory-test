import { getActiveBusiness } from "@/lib/businesses";
import { reportFilename, toCsv } from "@/lib/csv";
import {
  parseMovementTypeFilter,
  parseOrderReportStatus,
  parseReportDate,
  parseReportKind,
  reportStatusFor,
} from "@/lib/report-input";
import {
  movementCsvRows,
  orderCsvRows,
  REPORT_CSV_HEADERS,
  stockCsvRows,
  valuationCsvRows,
} from "@/lib/report-csv";
import {
  getMovementReport,
  getOrderStatusReport,
  getStockReport,
  getValuationReport,
} from "@/lib/reports";
import { getSessionUser } from "@/lib/session";

/**
 * One CSV endpoint for every report. It resolves the business from the session —
 * never from the URL — and runs the same query as the screen with the page limit
 * removed, so the file always matches the view it was exported from.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return new Response("Sign in to export reports.", { status: 401 });
  }

  const { active } = await getActiveBusiness(user.id);
  if (!active) {
    return new Response("No business is selected.", { status: 404 });
  }

  // A viewer may read quantities on screen, but no report leaves the app with the
  // business's costs in it.
  if (active.role === "viewer") {
    return new Response("Your role cannot export reports.", { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const kind = parseReportKind(params.get("report"));
  const search = (params.get("q") ?? "").trim().slice(0, 80);

  let rows: (string | number)[][];

  if (kind === "stock" || kind === "low") {
    const report = await getStockReport(user.id, active.id, {
      search,
      status: reportStatusFor(kind, params.get("status")),
      pageSize: null,
    });
    rows = stockCsvRows(report.rows);
  } else if (kind === "movements") {
    const report = await getMovementReport(user.id, active.id, {
      search,
      movementType: parseMovementTypeFilter(params.get("type")),
      from: parseReportDate(params.get("from")),
      to: parseReportDate(params.get("to")),
      pageSize: null,
    });
    rows = movementCsvRows(report.rows);
  } else if (kind === "orders") {
    const report = await getOrderStatusReport(user.id, active.id, {
      search,
      status: parseOrderReportStatus(params.get("status")),
      pageSize: null,
    });
    rows = orderCsvRows(report.rows);
  } else {
    const report = await getValuationReport(user.id, active.id);
    rows = valuationCsvRows(report);
  }

  const csv = toCsv([REPORT_CSV_HEADERS[kind], ...rows]);

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${reportFilename(
        kind,
        active.name,
      )}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
