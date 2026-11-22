import { FilterForm } from "@/components/filter-form";
import { ORDER_FILTERS, type OrderFilter } from "@/lib/purchase-order-input";

/**
 * The URL carries the view, so "what is still owing" can be bookmarked or sent to
 * whoever chases the supplier. Applying a filter is a router transition.
 */
export function PurchaseOrderFilters({
  q,
  status,
}: {
  q: string;
  status: OrderFilter;
}) {
  const filtered = q !== "" || status !== "all";

  return (
    <FilterForm action="/purchase-orders" filtered={filtered}>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
          Search
        </span>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Order number or supplier"
          className="h-9 w-[220px] rounded border border-line bg-surface px-2.5 text-[13px]"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
          Status
        </span>
        <select
          name="status"
          defaultValue={status === "all" ? "" : status}
          className="h-9 rounded border border-line bg-surface px-2 text-[13px] text-ink"
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
    </FilterForm>
  );
}
