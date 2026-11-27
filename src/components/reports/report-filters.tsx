import { FilterForm } from "@/components/filter-form";
import { FilterSearch } from "@/components/filter-search";
import { MobileFilters, type FilterChip } from "@/components/mobile-filters";
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

const SELECT =
  "h-11 w-full rounded border border-line bg-surface px-2 text-[13px] text-ink min-[600px]:h-9 min-[600px]:w-auto";

/** The current report without one filter; the phone's chips are links to it. */
function hrefWith(values: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `/reports?${query}` : "/reports";
}

/**
 * A GET form submitted through the router, like the other lists: the URL describes
 * the report, so a filtered view can be bookmarked and its export link carries the
 * same filters. Clear keeps the report in the URL rather than dropping to the
 * default one. The valuation report has nothing to filter, so it renders no form.
 *
 * Below 600px the search keeps its own row, the fields open in a sheet and each
 * filter that is on is a chip, the same language the other lists speak. The report
 * kind stays in the form either way.
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

  const q = filters.q || undefined;
  // The order report matches its number and supplier, the other two their product.
  const searchPlaceholder =
    kind === "orders" ? "Order number or supplier" : "Product name or SKU";
  const chips: FilterChip[] = [];

  if (kind === "stock" && filters.status !== "all") {
    chips.push({
      label: `Stock: ${REPORT_STATUS_LABELS[filters.status]}`,
      href: hrefWith({ report: kind, q }),
    });
  }
  if (kind === "movements") {
    if (filters.movementType !== "all") {
      chips.push({
        label: `Type: ${movementTypeLabel(filters.movementType)}`,
        href: hrefWith({
          report: kind,
          q,
          from: filters.from || undefined,
          to: filters.to || undefined,
        }),
      });
    }
    if (filters.from) {
      chips.push({
        label: `From: ${filters.from}`,
        href: hrefWith({
          report: kind,
          q,
          type:
            filters.movementType === "all" ? undefined : filters.movementType,
          to: filters.to || undefined,
        }),
      });
    }
    if (filters.to) {
      chips.push({
        label: `To: ${filters.to}`,
        href: hrefWith({
          report: kind,
          q,
          type:
            filters.movementType === "all" ? undefined : filters.movementType,
          from: filters.from || undefined,
        }),
      });
    }
  }
  if (kind === "orders" && filters.orderStatus !== "all") {
    chips.push({
      label: `Status: ${ORDER_REPORT_STATUS_LABELS[filters.orderStatus]}`,
      href: hrefWith({ report: kind, q }),
    });
  }

  // Keyed by the URL's values: the controls are uncontrolled, so a change made
  // outside them — a chip, Clear, Back — has to remount them to show it. The
  // report kind rides in the form, so it survives both bars' submissions.
  const fields = (
    <div
      key={`${kind}|${filters.status}|${filters.orderStatus}|${filters.movementType}|${filters.from}|${filters.to}`}
      className="flex flex-col gap-3 min-[600px]:contents"
    >
      <input type="hidden" name="report" value={kind} />

      {kind === "stock" ? (
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
            Status
          </span>
          <select
            name="status"
            defaultValue={filters.status === "all" ? "" : filters.status}
            className={SELECT}
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
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
              Type
            </span>
            <select
              name="type"
              defaultValue={
                filters.movementType === "all" ? "" : filters.movementType
              }
              className={SELECT}
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
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
              From
            </span>
            <input
              type="date"
              name="from"
              defaultValue={filters.from}
              className={`${SELECT} min-[600px]:w-[150px]`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
              To
            </span>
            <input
              type="date"
              name="to"
              defaultValue={filters.to}
              className={`${SELECT} min-[600px]:w-[150px]`}
            />
          </label>
        </>
      ) : null}

      {kind === "orders" ? (
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
            Status
          </span>
          <select
            name="status"
            defaultValue={
              filters.orderStatus === "all" ? "" : filters.orderStatus
            }
            className={SELECT}
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
    </div>
  );

  return (
    <>
      <div className="hidden min-[600px]:block">
        <FilterForm
          action="/reports"
          clearHref={`/reports?report=${kind}`}
          filtered={filtered}
        >
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
              Search
            </span>
            <FilterSearch
              value={filters.q}
              placeholder={searchPlaceholder}
              className="h-9 w-[220px] rounded border border-line bg-surface px-2.5 text-[13px]"
            />
          </label>
          {fields}
        </FilterForm>
      </div>

      <MobileFilters
        action="/reports"
        clearHref={`/reports?report=${kind}`}
        filtered={filtered}
        q={filters.q}
        searchLabel="Search reports"
        searchPlaceholder={searchPlaceholder}
        chips={chips}
      >
        {fields}
      </MobileFilters>
    </>
  );
}
