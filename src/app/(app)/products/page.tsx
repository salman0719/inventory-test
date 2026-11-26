import { PendingLink } from "@/components/pending-link";
import { NoBusinessNotice } from "@/components/no-business-notice";
import { Pagination } from "@/components/pagination";
import { PanelGrid, PanelProvider } from "@/components/panel-host";
import { PanelLink } from "@/components/panel-link";
import { ProductFilters } from "@/components/products/product-filters";
import { ProductPanelColumn } from "@/components/products/product-panel-column";
import { ProductTable } from "@/components/products/product-table";
import { ResultsBusy } from "@/components/results-busy";
import { getActiveBusiness } from "@/lib/businesses";
import { parseProductSort } from "@/lib/product-input";
import { getProductsPage } from "@/lib/products";
import { getSessionUser } from "@/lib/session";

const PAGE_SIZE = 50;

type SearchParams = Record<string, string | string[] | undefined>;

function single(params: SearchParams, key: string): string {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

/**
 * Products: the list, its filters and the detail panel.
 *
 * The list's state lives in the URL - search, category, sort, page - so every view
 * is linkable. The panel's state is in the URL too, but it is not fetched here: a
 * row click replaces the query string and asks `/api/products/panel` for the panel's
 * data, so one click costs one small request instead of a page render that re-runs
 * this list. A reload or a shared link still opens the panel, from `initialHref`.
 */
export default async function ProductsPage({
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
  const archived = single(params, "archived") === "true";
  const sort = parseProductSort(single(params, "sort"));
  const requestedPage = Number.parseInt(single(params, "page"), 10);
  const page =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const selectedId = single(params, "product");
  const creating = single(params, "new") === "true";
  const editing = single(params, "edit") === "true";
  const saved = single(params, "saved") === "true";

  // One transaction for the list and its filter options.
  const { products, total, categories } = await getProductsPage(
    user.id,
    active.id,
    {
      search: q,
      categoryId,
      includeArchived: archived,
      sort,
      page,
      pageSize: PAGE_SIZE,
    },
  );

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = q !== "" || categoryId !== "" || archived;

  /** Keep the current view in every link, overriding only what changes. */
  function hrefFor(overrides: Record<string, string | undefined>): string {
    const values: Record<string, string | undefined> = {
      q: q || undefined,
      cat: categoryId || undefined,
      sort: sort === "name" ? undefined : sort,
      archived: archived ? "true" : undefined,
      page: page > 1 ? String(page) : undefined,
      product: selectedId || undefined,
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
    return query ? `/products?${query}` : "/products";
  }

  /**
   * A link to another page of the list, with no panel in it. The pager is rendered
   * by the server while a row may be open, and closing a panel only rewrites the
   * client URL, so a pager href that kept `product` would reopen the row the user
   * had just closed.
   */
  function listHrefFor(overrides: Record<string, string | undefined>): string {
    return hrefFor({
      product: undefined,
      new: undefined,
      edit: undefined,
      saved: undefined,
      ...overrides,
    });
  }

  /** The label sheet prints this list's filtered products. */
  function labelsHref(): string {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (categoryId) search.set("cat", categoryId);
    if (archived) search.set("archived", "true");
    const query = search.toString();
    return query ? `/products/labels?${query}` : "/products/labels";
  }

  return (
    <PanelProvider initialHref={hrefFor({})}>
      <section className="flex flex-col gap-4">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-[15px] font-semibold tracking-tight">Products</h1>
          <p className="text-[12px] text-ink-muted">
            {total} product{total === 1 ? "" : "s"}
            {filtered ? " match these filters" : ""} · {active.name}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <PendingLink
              href="/scan"
              className="inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-2.5 text-[12px] font-medium hover:border-accent hover:text-accent"
            >
              Scan
            </PendingLink>
            <PendingLink
              href={labelsHref()}
              className="inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-2.5 text-[12px] font-medium hover:border-accent hover:text-accent"
            >
              Print labels
            </PendingLink>
            <PendingLink
              href="/import"
              className="inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-2.5 text-[12px] font-medium hover:border-accent hover:text-accent"
            >
              Import
            </PendingLink>
            {creating ? null : (
              <PanelLink
                href={hrefFor({
                  new: "true",
                  product: undefined,
                  edit: undefined,
                })}
                className="inline-flex min-h-[36px] items-center rounded bg-accent px-3 text-[12px] font-semibold text-on-accent"
              >
                New product
              </PanelLink>
            )}
          </div>
        </header>

        <ResultsBusy>
          <ProductFilters
            q={q}
            categoryId={categoryId}
            categories={categories}
            sort={sort}
            archived={archived}
          />

          <PanelGrid panel={<ProductPanelColumn />} label="Product details">
            {products.length > 0 ? (
              <ProductTable
                products={products}
                currency={active.currencyCode}
                rowHref={(productId) => hrefFor({ product: productId })}
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
                    ? "Clear the filters, or search for a different name, SKU or barcode."
                    : "Add the first product to start the catalogue, or seed the demo data with npm run db:seed."}
                </p>
                {filtered ? (
                  <PendingLink
                    href="/products"
                    className="mt-4 inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-3 text-[12px] font-medium hover:border-accent hover:text-accent"
                  >
                    Clear filters
                  </PendingLink>
                ) : (
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <PanelLink
                      href={hrefFor({ new: "true" })}
                      className="inline-flex min-h-[36px] items-center rounded bg-accent px-3 text-[12px] font-semibold text-on-accent"
                    >
                      New product
                    </PanelLink>
                    <PendingLink
                      href="/import"
                      className="inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-3 text-[12px] font-medium hover:border-accent hover:text-accent"
                    >
                      Import a CSV
                    </PendingLink>
                  </div>
                )}
              </div>
            )}

            <Pagination
              page={page}
              pageCount={pageCount}
              previousHref={
                page > 1 ? listHrefFor({ page: String(page - 1) }) : undefined
              }
              nextHref={
                page < pageCount
                  ? listHrefFor({ page: String(page + 1) })
                  : undefined
              }
            />
          </PanelGrid>
        </ResultsBusy>
      </section>
    </PanelProvider>
  );
}
