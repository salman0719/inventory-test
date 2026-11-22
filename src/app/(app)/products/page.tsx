import Link from "next/link";
import { NoBusinessNotice } from "@/components/no-business-notice";
import { ProductFilters } from "@/components/products/product-filters";
import { ProductPanel } from "@/components/products/product-panel";
import { ProductTable } from "@/components/products/product-table";
import { getActiveBusiness } from "@/lib/businesses";
import { parseProductSort } from "@/lib/product-input";
import {
  getProduct,
  listCategories,
  listProducts,
  listSuppliers,
} from "@/lib/products";
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
 * All state lives in the URL - search, category, sort, page, which product is open
 * and whether the form is open - so every view is linkable and the page needs no
 * client-side data fetching.
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

  const [{ products, total }, categories, suppliers, selected] =
    await Promise.all([
      listProducts(user.id, active.id, {
        search: q,
        categoryId,
        includeArchived: archived,
        sort,
        page,
        pageSize: PAGE_SIZE,
      }),
      listCategories(user.id, active.id),
      listSuppliers(user.id, active.id),
      selectedId ? getProduct(user.id, active.id, selectedId) : null,
    ]);

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

  const closeHref = hrefFor({
    product: undefined,
    new: undefined,
    edit: undefined,
    saved: undefined,
  });
  const showPanel = creating || selectedId !== "";

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-[15px] font-semibold tracking-tight">Products</h1>
        <p className="text-[12px] text-ink-muted">
          {total} product{total === 1 ? "" : "s"}
          {filtered ? " match these filters" : ""} · {active.name}
        </p>
        {creating ? null : (
          <Link
            href={hrefFor({ new: "true", product: undefined, edit: undefined })}
            className="ml-auto inline-flex min-h-[36px] items-center rounded bg-accent px-3 text-[12px] font-semibold text-on-accent"
          >
            New product
          </Link>
        )}
      </header>

      <ProductFilters
        q={q}
        categoryId={categoryId}
        categories={categories}
        sort={sort}
        archived={archived}
      />

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
              <ProductPanel
                mode="create"
                product={null}
                categories={categories}
                suppliers={suppliers}
                currency={active.currencyCode}
                saved={false}
                closeHref={closeHref}
              />
            ) : selected ? (
              <ProductPanel
                mode={editing ? "edit" : "detail"}
                product={selected}
                categories={categories}
                suppliers={suppliers}
                currency={active.currencyCode}
                saved={saved && !editing}
                closeHref={closeHref}
                editHref={hrefFor({ product: selected.id, edit: "true" })}
              />
            ) : (
              <div className="rounded border border-line bg-surface px-3 py-6 text-center">
                <p className="text-[13px] font-medium">
                  That product is not in this business
                </p>
                <p className="mt-1 text-[12px] text-ink-muted">
                  Open a product from the list, or close this panel.
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
          {products.length > 0 ? (
            <ProductTable
              products={products}
              currency={active.currencyCode}
              selectedId={selectedId}
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
                  : "Add the first product to start the catalogue, or seed the demo data with npm run db:seed."}
              </p>
              <Link
                href={filtered ? "/products" : hrefFor({ new: "true" })}
                className="mt-4 inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-3 text-[12px] font-medium hover:border-accent hover:text-accent"
              >
                {filtered ? "Clear filters" : "New product"}
              </Link>
            </div>
          )}

          {pageCount > 1 ? (
            <nav
              aria-label="Pagination"
              className="flex items-center gap-2 text-[12px] text-ink-muted"
            >
              {page > 1 ? (
                <Link
                  href={hrefFor({ page: String(page - 1) })}
                  className="inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-2.5 font-medium hover:border-accent hover:text-accent"
                >
                  Previous
                </Link>
              ) : null}
              <span>
                Page {Math.min(page, pageCount)} of {pageCount}
              </span>
              {page < pageCount ? (
                <Link
                  href={hrefFor({ page: String(page + 1) })}
                  className="inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-2.5 font-medium hover:border-accent hover:text-accent"
                >
                  Next
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>
      </div>
    </section>
  );
}
