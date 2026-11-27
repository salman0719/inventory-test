import { PendingLink } from "@/components/pending-link";
import { ResultsBusy } from "@/components/results-busy";
import { NoBusinessNotice } from "@/components/no-business-notice";
import { PanelGrid, PanelProvider } from "@/components/panel-host";
import {
  PageHeader,
  headerActionPrimary,
  headerActionSecondary,
} from "@/components/page-header";
import { PanelLink } from "@/components/panel-link";
import { SupplierFilters } from "@/components/suppliers/supplier-filters";
import { SupplierPanelColumn } from "@/components/suppliers/supplier-panel-column";
import { SupplierTable } from "@/components/suppliers/supplier-table";
import { getActiveBusiness } from "@/lib/businesses";
import { getSessionUser } from "@/lib/session";
import { listSuppliers } from "@/lib/suppliers";

type SearchParams = Record<string, string | string[] | undefined>;

function single(params: SearchParams, key: string): string {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

/**
 * Suppliers: the list and its panel, with the same URL-as-state rules as products.
 *
 * The panel is fetched by the panel (`/api/suppliers/panel`) rather than by this
 * page, so a row click does not re-run the supplier query behind it.
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

  const suppliers = await listSuppliers(user.id, active.id, {
    search: q,
    includeArchived: archived,
  });

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

  return (
    <PanelProvider initialHref={hrefFor({})}>
      <section className="flex flex-col gap-4">
        <PageHeader
          title="Suppliers"
          summary={
            <>
              {suppliers.length} supplier{suppliers.length === 1 ? "" : "s"}
              {filtered ? " match these filters" : ""} · {active.name}
            </>
          }
          actions={
            <>
              <PendingLink
                href="/import?kind=suppliers"
                className={headerActionSecondary}
              >
                Import
              </PendingLink>
              {creating ? null : (
                <PanelLink
                  href={hrefFor({
                    new: "true",
                    supplier: undefined,
                    edit: undefined,
                  })}
                  className={headerActionPrimary}
                >
                  New supplier
                </PanelLink>
              )}
            </>
          }
        />

        <ResultsBusy>
          <SupplierFilters q={q} archived={archived} />

          <PanelGrid panel={<SupplierPanelColumn />} label="Supplier details">
            {suppliers.length > 0 ? (
              <SupplierTable
                suppliers={suppliers}
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
                {filtered ? (
                  <PendingLink
                    href="/suppliers"
                    className="mt-4 inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-3 text-[12px] font-medium hover:border-accent hover:text-accent"
                  >
                    Clear filters
                  </PendingLink>
                ) : (
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <PanelLink
                      href={hrefFor({ new: "true" })}
                      className="inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-3 text-[12px] font-medium hover:border-accent hover:text-accent"
                    >
                      New supplier
                    </PanelLink>
                    <PendingLink
                      href="/import?kind=suppliers"
                      className="inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-3 text-[12px] font-medium hover:border-accent hover:text-accent"
                    >
                      Import a CSV
                    </PendingLink>
                  </div>
                )}
              </div>
            )}
          </PanelGrid>
        </ResultsBusy>
      </section>
    </PanelProvider>
  );
}
