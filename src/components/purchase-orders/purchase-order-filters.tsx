import Link from "next/link";
import { ORDER_FILTERS, type OrderFilter } from "@/lib/purchase-order-input";

/**
 * A plain GET form like the other lists: the URL carries the view, so "what is
 * still owing" can be bookmarked or sent to whoever chases the supplier.
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
    <form
      method="get"
      action="/purchase-orders"
      className="flex flex-wrap items-end gap-2 rounded border border-line bg-panel px-2.5 py-2"
    >
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

      <button
        type="submit"
        className="min-h-[36px] rounded bg-accent px-3 text-[12px] font-semibold text-on-accent"
      >
        Apply
      </button>

      {filtered ? (
        <Link
          href="/purchase-orders"
          className="min-h-[36px] rounded border border-line bg-surface px-2.5 text-[12px] font-medium leading-[34px] hover:border-accent hover:text-accent"
        >
          Clear
        </Link>
      ) : null}
    </form>
  );
}
