import Link from "next/link";
import {
  MOVEMENT_TYPE_FILTERS,
  ORDER_REPORT_STATUSES,
  ORDER_REPORT_STATUS_LABELS,
  REPORT_STATUSES,
  REPORT_STATUS_LABELS,
  movementTypeLabel,
  type ReportFilters as Filters,
  type ReportKind,
} from "@/lib/report-input";

const INPUT =
  "h-9 rounded border border-line bg-surface px-2.5 text-[13px] text-ink";
const LABEL =
  "flex flex-col gap-1 text-[10px] uppercase tracking-[0.07em] text-ink-muted";

/**
 * A plain GET form, like the other lists: the URL describes the report, so a
 * filtered view can be bookmarked and its export link carries the same filters.
 * The valuation report has nothing to filter, so it renders no form at all.
 */
export function ReportFilters({
  kind,
  filters,
}: {
  kind: ReportKind;
  filters: Filters;
}) {
  if (kind === "valuation") return null;

  const filtered =
    filters.q !== "" ||
    (kind === "stock" && filters.status !== "all") ||
    (kind === "movements" &&
      (filters.movementType !== "all" ||
        filters.from !== "" ||
        filters.to !== "")) ||
    (kind === "orders" && filters.orderStatus !== "all");

  return (
    <form
      method="get"
      action="/reports"
      className="flex flex-wrap items-end gap-2 rounded border border-line bg-panel px-2.5 py-2"
    >
      <input type="hidden" name="report" value={kind} />

      <label className={LABEL}>
        <span>Search</span>
        <input
          type="search"
          name="q"
          defaultValue={filters.q}
          placeholder="Product name or SKU"
          className={`${INPUT} w-[220px]`}
        />
      </label>

      {kind === "stock" ? (
        <label className={LABEL}>
          <span>Status</span>
          <select
            name="status"
            defaultValue={filters.status === "all" ? "" : filters.status}
            className={INPUT}
          >
            <option value="">All stock</option>
            {REPORT_STATUSES.filter(
              (option) => option !== "all" && option !== "ok",
            ).map((option) => (
              <option key={option} value={option}>
                {REPORT_STATUS_LABELS[option]}
              </option>
            ))}
            <option value="ok">In stock</option>
          </select>
        </label>
      ) : null}

      {kind === "movements" ? (
        <>
          <label className={LABEL}>
            <span>Type</span>
            <select
              name="type"
              defaultValue={
                filters.movementType === "all" ? "" : filters.movementType
              }
              className={INPUT}
            >
              <option value="">All types</option>
              {MOVEMENT_TYPE_FILTERS.filter((type) => type !== "all").map(
                (type) => (
                  <option key={type} value={type}>
                    {movementTypeLabel(type)}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className={LABEL}>
            <span>From</span>
            <input
              type="date"
              name="from"
              defaultValue={filters.from}
              className={`${INPUT} w-[150px]`}
            />
          </label>
          <label className={LABEL}>
            <span>To</span>
            <input
              type="date"
              name="to"
              defaultValue={filters.to}
              className={`${INPUT} w-[150px]`}
            />
          </label>
        </>
      ) : null}

      {kind === "orders" ? (
        <label className={LABEL}>
          <span>Status</span>
          <select
            name="status"
            defaultValue={
              filters.orderStatus === "all" ? "" : filters.orderStatus
            }
            className={INPUT}
          >
            <option value="">All orders</option>
            {ORDER_REPORT_STATUSES.filter((status) => status !== "all").map(
              (status) => (
                <option key={status} value={status}>
                  {ORDER_REPORT_STATUS_LABELS[status]}
                </option>
              ),
            )}
          </select>
        </label>
      ) : null}

      <button
        type="submit"
        className="min-h-[36px] rounded bg-accent px-3 text-[12px] font-semibold text-on-accent"
      >
        Apply
      </button>

      {filtered ? (
        <Link
          href={`/reports?report=${kind}`}
          className="min-h-[36px] rounded border border-line bg-surface px-2.5 text-[12px] font-medium leading-[34px] hover:border-accent hover:text-accent"
        >
          Clear
        </Link>
      ) : null}
    </form>
  );
}
