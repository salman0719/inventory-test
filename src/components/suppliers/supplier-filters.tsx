import { FilterForm } from "@/components/filter-form";
import { FilterSearch } from "@/components/filter-search";
import { MobileFilters, type FilterChip } from "@/components/mobile-filters";

/** The current view without one filter; the phone's chips are links to it. */
function hrefWith(values: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `/suppliers?${query}` : "/suppliers";
}

/**
 * Suppliers are few, so search and an archived toggle are the whole filter set.
 * Below 600px the toggle moves into the Filters sheet with the search inline.
 */
export function SupplierFilters({
  q,
  archived,
}: {
  q: string;
  archived: boolean;
}) {
  const filtered = q !== "" || archived;
  const chips: FilterChip[] = archived
    ? [
        {
          label: "Include archived",
          href: hrefWith({ q: q || undefined, archived: undefined }),
        },
      ]
    : [];

  // Keyed by the URL's values: the toggle is uncontrolled, so a change made
  // outside it — the chip, Clear, Back — has to remount it to show it.
  const fields = (
    <div
      key={String(archived)}
      className="flex flex-col gap-3 min-[600px]:contents"
    >
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
        <FilterForm action="/suppliers" filtered={filtered}>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
              Search
            </span>
            <FilterSearch
              value={q}
              placeholder="Name, contact or email"
              className="h-9 w-[220px] rounded border border-line bg-surface px-2.5 text-[13px]"
            />
          </label>
          {fields}
        </FilterForm>
      </div>

      <MobileFilters
        action="/suppliers"
        filtered={filtered}
        q={q}
        searchLabel="Search suppliers"
        searchPlaceholder="Name, contact or email"
        chips={chips}
      >
        {fields}
      </MobileFilters>
    </>
  );
}
