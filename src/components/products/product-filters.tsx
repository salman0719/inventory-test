import { FilterForm } from "@/components/filter-form";
import { FilterSearch } from "@/components/filter-search";
import { MobileFilters, type FilterChip } from "@/components/mobile-filters";
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
  "h-11 w-full rounded border border-line bg-surface px-2 text-[13px] text-ink min-[600px]:h-9 min-[600px]:w-auto";

/** The current view without one filter; the phone's chips are links to it. */
function hrefWith(values: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `/products?${query}` : "/products";
}

/**
 * The URL is the state, so a filtered list can be bookmarked and shared. Applying
 * one goes through the router, so the rows already on screen stay until the new
 * ones arrive instead of the document reloading.
 *
 * Below 600px the search keeps its own row and the rest of the fields open in a
 * sheet; from 600px up the same fields render in the inline bar.
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
  const view = {
    q: q || undefined,
    cat: categoryId || undefined,
    sort: sort === "name" ? undefined : sort,
    archived: archived ? "true" : undefined,
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
  if (sort !== "name") {
    chips.push({
      label: `Sort: ${SORT_LABELS[sort]}`,
      href: hrefWith({ ...view, sort: undefined }),
    });
  }
  if (archived) {
    chips.push({
      label: "Include archived",
      href: hrefWith({ ...view, archived: undefined }),
    });
  }

  // Keyed by the URL's values: the controls are uncontrolled, so a change made
  // outside them — a chip, Clear, Back — has to remount them to show it.
  const fields = (
    <div
      key={`${categoryId}|${sort}|${archived}`}
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

      <label className="flex min-h-[44px] items-center gap-1.5 text-[12px] min-[600px]:min-h-[36px]">
        <input
          type="checkbox"
          name="archived"
          value="true"
          defaultChecked={archived}
          className="h-4 w-4"
        />
        Include archived
      </label>
    </div>
  );

  return (
    <>
      <div className="hidden min-[600px]:block">
        <FilterForm action="/products" filtered={filtered}>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
              Search
            </span>
            <FilterSearch
              value={q}
              placeholder="Name, SKU or barcode"
              className="h-9 w-[190px] rounded border border-line bg-surface px-2.5 text-[13px]"
            />
          </label>
          {fields}
        </FilterForm>
      </div>

      <MobileFilters
        action="/products"
        filtered={filtered}
        q={q}
        searchLabel="Search products"
                      searchPlaceholder="Name, SKU or barcode"
        chips={chips}
      >
        {fields}
      </MobileFilters>
    </>
  );
}
