import Link from "next/link";
import { DetailPanel } from "@/components/detail-panel";
import { InventoryFilters } from "@/components/inventory/inventory-filters";
import { InventoryPanel } from "@/components/inventory/inventory-panel";
import { InventoryTable } from "@/components/inventory/inventory-table";
import { NoBusinessNotice } from "@/components/no-business-notice";
import { getActiveBusiness } from "@/lib/businesses";
import { formatMoney } from "@/lib/product-input";
import { listCategories } from "@/lib/products";
import {
  getInventoryDetail,
  getStockSummary,
  listInventory,
} from "@/lib/stock";
import { parseStockFilter, parseStockSort } from "@/lib/stock-input";
import { getSessionUser } from "@/lib/session";

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
 * As on the other lists, all state lives in the URL, so the page needs no client
 * data fetching and every view can be linked to.
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

  const [{ items, total }, summary, categories, selected] = await Promise.all([
    listInventory(user.id, active.id, {
      search: q,
      categoryId,
      status,
      sort,
      page,
      pageSize: PAGE_SIZE,
    }),
    getStockSummary(user.id, active.id),
    listCategories(user.id, active.id),
    selectedId ? getInventoryDetail(user.id, active.id, selectedId) : null,
  ]);

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

  const closeHref = hrefFor({ product: undefined, saved: undefined });
  const showPanel = selectedId !== "";

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-[15px] font-semibold tracking-tight">Inventory</h1>
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

      <InventoryFilters
        q={q}
        categoryId={categoryId}
        categories={categories}
        status={status}
        sort={sort}
      />

      <div
        className={`grid gap-3 ${
          showPanel
            ? "min-[900px]:grid-cols-[minmax(0,1fr)_360px] min-[900px]:items-start"
            : ""
        }`}
      >
        {showPanel ? (
          <DetailPanel closeHref={closeHref} label="stock details">
            {selected ? (
              <InventoryPanel
                item={selected.item}
                movements={selected.movements}
                currency={active.currencyCode}
                saved={saved}
                closeHref={closeHref}
                canViewValues={canViewValues}
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
          </DetailPanel>
        ) : null}

        <div className="flex min-w-0 flex-col gap-3">
          {items.length > 0 ? (
            <InventoryTable
              items={items}
              currency={active.currencyCode}
              selectedId={selectedId}
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
              <Link
                href={filtered ? "/inventory" : "/products"}
                className="mt-4 inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-3 text-[12px] font-medium hover:border-accent hover:text-accent"
              >
                {filtered ? "Clear filters" : "Open products"}
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
