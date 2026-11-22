import Link from "next/link";

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
    <form
      method="get"
      action="/suppliers"
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

      <button
        type="submit"
        className="min-h-[36px] rounded bg-accent px-3 text-[12px] font-semibold text-on-accent"
      >
        Apply
      </button>

      {filtered ? (
        <Link
          href="/suppliers"
          className="min-h-[36px] rounded border border-line bg-surface px-2.5 text-[12px] font-medium leading-[34px] hover:border-accent hover:text-accent"
        >
          Clear
        </Link>
      ) : null}
    </form>
  );
}
