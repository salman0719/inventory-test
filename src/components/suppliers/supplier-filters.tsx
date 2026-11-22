import { FilterForm } from "@/components/filter-form";

/** Suppliers are few, so search and an archived toggle are the whole filter set. */
export function SupplierFilters({
  q,
  archived,
}: {
  q: string;
  archived: boolean;
}) {
  const filtered = q !== "" || archived;

  return (
    <FilterForm action="/suppliers" filtered={filtered}>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
          Search
        </span>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Name, contact or email"
          className="h-9 w-[220px] rounded border border-line bg-surface px-2.5 text-[13px]"
        />
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
    </FilterForm>
  );
}
