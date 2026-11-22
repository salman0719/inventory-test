import Link from "next/link";
import { NoBusinessNotice } from "@/components/no-business-notice";
import { SupplierFilters } from "@/components/suppliers/supplier-filters";
import { SupplierPanel } from "@/components/suppliers/supplier-panel";
import { SupplierTable } from "@/components/suppliers/supplier-table";
import { getActiveBusiness } from "@/lib/businesses";
import {
  getSupplier,
  listSuppliedProducts,
  listSuppliers,
} from "@/lib/suppliers";
import { getSessionUser } from "@/lib/session";

type SearchParams = Record<string, string | string[] | undefined>;

function single(params: SearchParams, key: string): string {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

/**
 * Suppliers: the list and its panel, with the same URL-as-state rules as products.
 * Contact details are free text except the email, which is validated because it is
 * the one field an operator will copy into a mail client.
 */
export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const user = await getSessionUser();
  if (!user) return null;

  const { active } = await getActiveBusiness(user.id);
  if (!active) return <NoBusinessNotice />;

  const q = single(params, "q").slice(0, 80);
  const archived = single(params, "archived") === "true";
  const selectedId = single(params, "supplier");
  const creating = single(params, "new") === "true";
  const editing = single(params, "edit") === "true";
  const saved = single(params, "saved") === "true";

  const [suppliers, selected] = await Promise.all([
    listSuppliers(user.id, active.id, { search: q, includeArchived: archived }),
    selectedId ? getSupplier(user.id, active.id, selectedId) : null,
  ]);

  const supplied = selected
    ? await listSuppliedProducts(user.id, active.id, selected.id)
    : [];

  const filtered = q !== "" || archived;

  function hrefFor(overrides: Record<string, string | undefined>): string {
    const values: Record<string, string | undefined> = {
      q: q || undefined,
      archived: archived ? "true" : undefined,
      supplier: selectedId || undefined,
      new: creating ? "true" : undefined,
      edit: editing ? "true" : undefined,
      saved: saved ? "true" : undefined,
      ...overrides,
    };
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (value) search.set(key, value);
    }
    const query = search.toString();
    return query ? `/suppliers?${query}` : "/suppliers";
  }

  const closeHref = hrefFor({
    supplier: undefined,
    new: undefined,
    edit: undefined,
    saved: undefined,
  });
  const showPanel = creating || selectedId !== "";

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-[15px] font-semibold tracking-tight">Suppliers</h1>
        <p className="text-[12px] text-ink-muted">
          {suppliers.length} supplier{suppliers.length === 1 ? "" : "s"}
          {filtered ? " match these filters" : ""} · {active.name}
        </p>
        {creating ? null : (
          <Link
            href={hrefFor({
              new: "true",
              supplier: undefined,
              edit: undefined,
            })}
            className="ml-auto inline-flex min-h-[36px] items-center rounded bg-accent px-3 text-[12px] font-semibold text-on-accent"
          >
            New supplier
          </Link>
        )}
      </header>

      <SupplierFilters q={q} archived={archived} />

      <div
        className={`grid gap-3 ${
          showPanel
            ? "min-[900px]:grid-cols-[minmax(0,1fr)_360px] min-[900px]:items-start"
            : ""
        }`}
      >
        {showPanel ? (
          <div className="order-first min-[900px]:order-last min-[900px]:sticky min-[900px]:top-3">
            {creating ? (
              <SupplierPanel
                mode="create"
                supplier={null}
                products={[]}
                saved={false}
                closeHref={closeHref}
              />
            ) : selected ? (
              <SupplierPanel
                mode={editing ? "edit" : "detail"}
                supplier={selected}
                products={supplied}
                saved={saved && !editing}
                closeHref={closeHref}
                editHref={hrefFor({ supplier: selected.id, edit: "true" })}
              />
            ) : (
              <div className="rounded border border-line bg-surface px-3 py-6 text-center">
                <p className="text-[13px] font-medium">
                  That supplier is not in this business
                </p>
                <p className="mt-1 text-[12px] text-ink-muted">
                  Open a supplier from the list, or close this panel.
                </p>
                <Link
                  href={closeHref}
                  className="mt-3 inline-flex min-h-[36px] items-center rounded border border-line px-2.5 text-[12px] font-medium hover:border-accent hover:text-accent"
                >
                  Close panel
                </Link>
              </div>
            )}
          </div>
        ) : null}

        <div className="flex min-w-0 flex-col gap-3">
          {suppliers.length > 0 ? (
            <SupplierTable
              suppliers={suppliers}
              selectedId={selectedId}
              hrefFor={(id) => hrefFor({ supplier: id })}
            />
          ) : (
            <div className="rounded border border-dashed border-line bg-panel px-4 py-12 text-center">
              <p className="text-[13px] font-medium">
                {filtered
                  ? "No suppliers match those filters"
                  : "No suppliers yet"}
              </p>
              <p className="mx-auto mt-1 max-w-[46ch] text-[12px] text-ink-muted">
                {filtered
                  ? "Clear the filters, or search for a different name, contact or email."
                  : "Add the first supplier so products and purchase orders can point at it."}
              </p>
              <Link
                href={filtered ? "/suppliers" : hrefFor({ new: "true" })}
                className="mt-4 inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-3 text-[12px] font-medium hover:border-accent hover:text-accent"
              >
                {filtered ? "Clear filters" : "New supplier"}
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
