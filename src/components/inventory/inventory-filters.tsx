import { FilterForm } from "@/components/filter-form";
import type { CategoryOption } from "@/lib/products";
import {
  STOCK_SORTS,
  type StockFilter,
  type StockSort,
} from "@/lib/stock-input";

const SORT_LABELS: Record<StockSort, string> = {
  name: "Name",
  low: "On hand, lowest first",
  high: "On hand, highest first",
};

const SELECT =
  "h-9 rounded border border-line bg-surface px-2 text-[13px] text-ink";

/**
 * The URL carries the view, so an out-of-stock list can be bookmarked and sent to
 * whoever does the ordering. Applying a filter is a router transition, not a
 * document reload.
 */
export function InventoryFilters({
  q,
  categoryId,
  categories,
  status,
  sort,
}: {
  q: string;
  categoryId: string;
  categories: CategoryOption[];
  status: StockFilter;
  sort: StockSort;
}) {
  const filtered = q !== "" || categoryId !== "" || status !== "all";

  return (
    <FilterForm action="/inventory" filtered={filtered}>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
          Search
        </span>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Name or SKU"
          className="h-9 w-[190px] rounded border border-line bg-surface px-2.5 text-[13px]"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
          Category
        </span>
        <select name="cat" defaultValue={categoryId} className={SELECT}>
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
          Stock
        </span>
        <select name="status" defaultValue={status} className={SELECT}>
          <option value="">All stock</option>
          <option value="out">Out of stock</option>
          <option value="low">Low stock</option>
          <option value="ok">In stock</option>
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
          Sort
        </span>
        <select name="sort" defaultValue={sort} className={SELECT}>
          {STOCK_SORTS.map((option) => (
            <option key={option} value={option}>
              {SORT_LABELS[option]}
            </option>
          ))}
        </select>
      </label>
    </FilterForm>
  );
}
