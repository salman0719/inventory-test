import { FilterForm } from "@/components/filter-form";
import { FilterSearch } from "@/components/filter-search";
import { MobileFilters, type FilterChip } from "@/components/mobile-filters";
import { ORDER_FILTERS, type OrderFilter } from "@/lib/purchase-order-input";

const SELECT =
  "h-11 w-full rounded border border-line bg-surface px-2 text-[13px] text-ink min-[600px]:h-9 min-[600px]:w-auto";

/** The current view without one filter; the phone's chips are links to it. */
function hrefWith(values: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `/purchase-orders?${query}` : "/purchase-orders";
}

/**
 * The URL carries the view, so "what is still owing" can be bookmarked or sent to
 * whoever chases the supplier. Applying a filter is a router transition.
 *
 * Below 600px the search keeps its own row and the status opens in a sheet; from
 * 600px up the same field renders in the inline bar.
 */
export function PurchaseOrderFilters({
  q,
  status,
}: {
  q: string;
  status: OrderFilter;
}) {
  const filtered = q !== "" || status !== "all";
  const chips: FilterChip[] =
    status === "all"
      ? []
      : [
          {
            label: `Status: ${
              ORDER_FILTERS.find((option) => option.value === status)?.label ??
              "Selected"
            }`,
            href: hrefWith({ q: q || undefined, status: undefined }),
          },
        ];

  // Keyed by the URL's value: the select is uncontrolled, so a change made
  // outside it — the chip, Clear, Back — has to remount it to show it.
  const fields = (
    <div key={status} className="flex flex-col gap-3 min-[600px]:contents">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
          Status
        </span>
        <select
          name="status"
          defaultValue={status === "all" ? "" : status}
          className={SELECT}
        >
          <option value="">All orders</option>
          {ORDER_FILTERS.filter((option) => option.value !== "all").map(
            (option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ),
          )}
        </select>
      </label>
    </div>
  );

  return (
    <>
      <div className="hidden min-[600px]:block">
        <FilterForm action="/purchase-orders" filtered={filtered}>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
              Search
            </span>
            <FilterSearch
              value={q}
              placeholder="Order number or supplier"
              className="h-9 w-[220px] rounded border border-line bg-surface px-2.5 text-[13px]"
            />
          </label>
          {fields}
        </FilterForm>
      </div>

      <MobileFilters
        action="/purchase-orders"
        filtered={filtered}
        q={q}
        searchLabel="Search purchase orders"
        searchPlaceholder="Order number or supplier"
        chips={chips}
      >
        {fields}
      </MobileFilters>
    </>
  );
}
