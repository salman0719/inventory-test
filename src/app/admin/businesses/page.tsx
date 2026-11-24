import type { Metadata } from "next";
import Link from "next/link";
import { formatDay, listBusinesses, type BusinessSummary } from "@/lib/admin";
import { parseAdminSearch } from "@/lib/admin-input";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Businesses — Admin — Stk" };

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Every business as counts and its owner — deliberately not as a way in. There is no
 * link from here into a tenant's catalogue, prices or ledger; the admin panel's job is
 * to know a business exists and how big it is, not to read its books.
 */
export default async function BusinessesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const search = parseAdminSearch(params.q);

  const user = await getSessionUser();
  if (!user) return null;

  const rows = await listBusinesses(user.id, search);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-[17px] font-semibold tracking-tight">Businesses</h1>
        <p className="text-[12px] text-ink-muted">
          {rows.length} {rows.length === 1 ? "business" : "businesses"}
          {search ? " match this search" : ""}
        </p>
      </header>

      <form
        method="get"
        action="/admin/businesses"
        className="flex flex-wrap items-end gap-2 rounded border border-line bg-panel px-3 py-2.5"
      >
        <label className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
            Search
          </span>
          <input
            type="search"
            name="q"
            defaultValue={search}
            maxLength={80}
            placeholder="Business name"
            className="min-h-[34px] rounded border border-line bg-surface px-2 text-[12.5px]"
          />
        </label>
        <button
          type="submit"
          className="min-h-[34px] rounded bg-accent px-3 text-[12px] font-semibold text-on-accent"
        >
          Search
        </button>
        {search ? (
          <Link
            href="/admin/businesses"
            className="min-h-[34px] content-center text-[12px] text-ink-muted hover:text-accent"
          >
            Clear
          </Link>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <div className="rounded border border-dashed border-line bg-panel px-4 py-12 text-center">
          <p className="text-[13px] font-medium">No businesses match</p>
          <p className="mx-auto mt-1 max-w-[46ch] text-[12px] text-ink-muted">
            Search a full or partial business name.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line rounded border border-line bg-surface">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-1 px-3 py-2.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-[13px] font-medium">{row.name}</span>
                <span className="text-[11px] text-ink-faint">
                  {typeLabel(row)}
                </span>
                <span className="ml-auto text-[11px] text-ink-faint">
                  since {formatDay(row.createdAt)}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-muted">
                <Figure label="products" value={row.products} />
                <Figure label="open orders" value={row.openOrders} />
                <Figure label="members" value={row.members} />
                <span className="text-ink-faint">
                  {row.ownerEmail ?? "no owner"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function typeLabel(row: BusinessSummary): string {
  return row.businessType === "cafe"
    ? "Café or restaurant"
    : row.businessType === "retail"
      ? "Retail shop"
      : "Something else";
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <span>
      {label} <b className="font-mono font-medium text-ink">{value}</b>
    </span>
  );
}
