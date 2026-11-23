import { FilterForm } from "@/components/filter-form";
import { FilterSearch } from "@/components/filter-search";
import { MobileFilters, type FilterChip } from "@/components/mobile-filters";
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

const STATUS_LABELS: Record<Exclude<StockFilter, "all">, string> = {
  out: "Out of stock",
  low: "Low stock",
  ok: "In stock",
};

const SELECT =
  "h-11 w-full rounded border border-line bg-surface px-2 text-[13px] text-ink min-[600px]:h-9 min-[600px]:w-auto";

/** The current view without one filter; the phone's chips are links to it. */
function hrefWith(values: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `/inventory?${query}` : "/inventory";
}

/**
 * The URL carries the view, so an out-of-stock list can be bookmarked and sent to
 * whoever does the ordering. Applying a filter is a router transition, not a
 * document reload.
 *
 * Below 600px the search keeps its own row and the rest of the fields open in a
 * sheet; from 600px up the same fields render in the inline bar.
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
  const view = {
    q: q || undefined,
    cat: categoryId || undefined,
    status: status === "all" ? undefined : status,
    sort: sort === "name" ? undefined : sort,
  };

  const chips: FilterChip[] = [];
  if (categoryId) {
    chips.push({
      label: `Category: ${
        categories.find((category) => category.id === categoryId)?.name ??
        "Selected"
      }`,
      href: hrefWith({ ...view, cat: undefined }),
    });
  }
  if (status !== "all") {
    chips.push({
      label: `Stock: ${STATUS_LABELS[status]}`,
      href: hrefWith({ ...view, status: undefined }),
    });
  }
  if (sort !== "name") {
    chips.push({
      label: `Sort: ${SORT_LABELS[sort]}`,
      href: hrefWith({ ...view, sort: undefined }),
    });
  }

  // Keyed by the URL's values: the controls are uncontrolled, so a change made
  // outside them — a chip, Clear, Back — has to remount them to show it.
  const fields = (
    <div
      key={`${categoryId}|${status}|${sort}`}
      className="flex flex-col gap-3 min-[600px]:contents"
    >
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
    </div>
  );

  return (
    <>
      <div className="hidden min-[600px]:block">
        <FilterForm action="/inventory" filtered={filtered}>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
              Search
            </span>
            <FilterSearch
              value={q}
              placeholder="Name or SKU"
              className="h-9 w-[190px] rounded border border-line bg-surface px-2.5 text-[13px]"
            />
          </label>
          {fields}
        </FilterForm>
      </div>

      <MobileFilters
        action="/inventory"
        filtered={filtered}
        q={q}
        searchLabel="Search inventory"
        searchPlaceholder="Name or SKU"
        chips={chips}
      >
        {fields}
      </MobileFilters>
    </>
  );
}
