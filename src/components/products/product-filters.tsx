import Link from "next/link";
import type { CategoryOption } from "@/lib/products";
import { PRODUCT_SORTS, type ProductSort } from "@/lib/product-input";

const SORT_LABELS: Record<ProductSort, string> = {
  name: "Name",
  sku: "SKU",
  cost: "Cost, high to low",
  onhand: "On hand, high to low",
  updated: "Recently updated",
};

const SELECT =
  "h-9 rounded border border-line bg-surface px-2 text-[13px] text-ink";

/**
 * Filters are a plain GET form: the URL is the state, so a filtered list can be
 * bookmarked, shared and reloaded without client JavaScript.
 */
export function ProductFilters({
  q,
  categoryId,
  categories,
  sort,
  archived,
}: {
  q: string;
  categoryId: string;
  categories: CategoryOption[];
  sort: ProductSort;
  archived: boolean;
}) {
  const filtered = q !== "" || categoryId !== "" || archived;

  return (
    <form
      method="get"
      action="/products"
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
              {category.name} ({category.productCount})
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
          Sort
        </span>
        <select name="sort" defaultValue={sort} className={SELECT}>
          {PRODUCT_SORTS.map((option) => (
            <option key={option} value={option}>
              {SORT_LABELS[option]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-h-[36px] items-center gap-1.5 text-[12px]">
        <input
          type="checkbox"
          name="archived"
          value="true"
          defaultChecked={archived}
          className="h-4 w-4"
        />
        Include archived
      </label>

      <button
        type="submit"
        className="min-h-[36px] rounded bg-accent px-3 text-[12px] font-semibold text-on-accent"
      >
        Apply
      </button>

      {filtered ? (
        <Link
          href="/products"
          className="min-h-[36px] rounded border border-line bg-surface px-2.5 text-[12px] font-medium leading-[34px] hover:border-accent hover:text-accent"
        >
          Clear
        </Link>
      ) : null}
    </form>
  );
}
