import { PendingLink } from "@/components/pending-link";
import { InventoryFilters } from "@/components/inventory/inventory-filters";
import { InventoryPanelColumn } from "@/components/inventory/inventory-panel-column";
import { InventoryTable } from "@/components/inventory/inventory-table";
import { NoBusinessNotice } from "@/components/no-business-notice";
import { Pagination } from "@/components/pagination";
import { PanelGrid, PanelProvider } from "@/components/panel-host";
import { ResultsBusy } from "@/components/results-busy";
import { getActiveBusiness } from "@/lib/businesses";
import { formatMoney } from "@/lib/product-input";
import { getSessionUser } from "@/lib/session";
import { getInventoryPage } from "@/lib/stock";
import { parseStockFilter, parseStockSort } from "@/lib/stock-input";

const PAGE_SIZE = 50;

type SearchParams = Record<string, string | string[] | undefined>;

function single(params: SearchParams, key: string): string {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

/**
 * Inventory: on-hand by product, the shortages first if you ask for them, and the
 * ledger behind any single product.
 *
 * The list's state lives in the URL; the open product does too, but its panel is
 * fetched by the panel itself (`/api/inventory/panel`), so opening a row leaves the
 * list's queries untouched.
 */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const user = await getSessionUser();
  if (!user) return null;

  const { active } = await getActiveBusiness(user.id);
  if (!active) return <NoBusinessNotice />;

  const canViewValues = active.role !== "viewer";
  const q = single(params, "q").slice(0, 80);
  const categoryId = single(params, "cat");
  const status = parseStockFilter(single(params, "status"));
  const sort = parseStockSort(single(params, "sort"));
  const requestedPage = Number.parseInt(single(params, "page"), 10);
  const page =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const selectedId = single(params, "product");
  const saved = single(params, "saved") === "true";

  // One transaction for the page of items, the summary and the filter options.
  const { items, total, summary, categories } = await getInventoryPage(
    user.id,
    active.id,
    {
      search: q,
      categoryId,
      status,
      sort,
      page,
      pageSize: PAGE_SIZE,
    },
  );

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = q !== "" || categoryId !== "" || status !== "all";

  function hrefFor(overrides: Record<string, string | undefined>): string {
    const values: Record<string, string | undefined> = {
      q: q || undefined,
      cat: categoryId || undefined,
      status: status === "all" ? undefined : status,
      sort: sort === "name" ? undefined : sort,
      page: page > 1 ? String(page) : undefined,
      product: selectedId || undefined,
      saved: saved ? "true" : undefined,
      ...overrides,
    };
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (value) search.set(key, value);
    }
    const query = search.toString();
    return query ? `/inventory?${query}` : "/inventory";
  }

  return (
    <PanelProvider initialHref={hrefFor({})}>
      <section className="flex flex-col gap-4">
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[15px] font-semibold tracking-tight">
            Inventory
          </h1>
          <p className="text-[12px] text-ink-muted">
            {filtered
              ? `${total} match these filters`
              : `${summary.products} product${summary.products === 1 ? "" : "s"}`}{" "}
            · {summary.outCount} out · {summary.lowCount} low
            {canViewValues ? (
              <>
                {" "}
                · {formatMoney(summary.stockValue, active.currencyCode)} at cost
              </>
            ) : null}{" "}
            · {active.name}
          </p>
        </header>

        <ResultsBusy>
          <InventoryFilters
            q={q}
            categoryId={categoryId}
            categories={categories}
            status={status}
            sort={sort}
          />

          <PanelGrid panel={<InventoryPanelColumn />} label="Stock details">
            {items.length > 0 ? (
              <InventoryTable
                items={items}
                currency={active.currencyCode}
                rowHref={(productId) =>
                  hrefFor({ product: productId, saved: undefined })
                }
                canViewValues={canViewValues}
              />
            ) : (
              <div className="rounded border border-dashed border-line bg-panel px-4 py-12 text-center">
                <p className="text-[13px] font-medium">
                  {filtered
                    ? "No products match those filters"
                    : "No products yet"}
                </p>
                <p className="mx-auto mt-1 max-w-[46ch] text-[12px] text-ink-muted">
                  {filtered
                    ? "Clear the filters, or search for a different name or SKU."
                    : "Add products in the catalogue first; their stock positions appear here."}
                </p>
                <PendingLink
                  href={filtered ? "/inventory" : "/products"}
                  className="mt-4 inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-3 text-[12px] font-medium hover:border-accent hover:text-accent"
                >
                  {filtered ? "Clear filters" : "Open products"}
                </PendingLink>
              </div>
            )}

            <Pagination
              page={page}
              pageCount={pageCount}
              previousHref={
                page > 1 ? hrefFor({ page: String(page - 1) }) : undefined
              }
              nextHref={
                page < pageCount
                  ? hrefFor({ page: String(page + 1) })
                  : undefined
              }
            />
          </PanelGrid>
        </ResultsBusy>
      </section>
    </PanelProvider>
  );
}
