import { formatMoney, formatQuantity, stockStatus } from "@/lib/product-input";
import type { ProductSummary } from "@/lib/products";
import { ListCardSkeletons } from "@/components/skeletons";
import { ListCard } from "../list-card";
import { PanelLink } from "../panel-link";
import { StatusChip, StatusLabel } from "./status-label";

const TH =
  "px-2.5 py-1.5 text-left text-[10px] font-medium uppercase tracking-[0.07em] text-ink-muted";
const TD = "px-2.5 py-1.5 align-middle";

/**
 * Dense product table (Direction C), with a card per product below 600px.
 *
 * Selecting a row loads the detail panel through the URL, so the list itself stays
 * a server component and the selection survives a reload. On a phone the table's
 * columns are wider than the screen, so the same records render as cards and the
 * whole card is the link.
 */
export function ProductTable({
  products,
  currency,
  rowHref,
  canViewValues = true,
}: {
  products: ProductSummary[];
  currency: string;
  /** The panel's URL for one row, carrying the current filters and page. */
  rowHref: (productId: string) => string;
  /** Viewers do not receive cost prices. */
  canViewValues?: boolean;
}) {
  return (
    <>
      <div data-card-rows className="flex min-[600px]:hidden flex-col gap-2">
        {products.map((product) => (
          <ListCard
            key={product.id}
            href={rowHref(product.id)}
            title={
              <>
                {product.name}
                {product.isArchived ? (
                  <span className="ml-2 rounded border border-line px-1.5 py-0.5 align-middle text-[10px] tracking-[0.06em] text-ink-muted uppercase">
                    Archived
                  </span>
                ) : null}
              </>
            }
            meta={
              <>
                <span className="font-mono">{product.sku}</span>
                {" · "}
                {product.categoryName ?? "—"}
              </>
            }
            badge={
              <StatusChip
                status={stockStatus(product.onHand, product.reorderLevel)}
              />
            }
            figures={[
              {
                label: "On hand",
                value: `${formatQuantity(product.onHand)} ${product.unitOfMeasure}`,
              },
              {
                label: "Reorder",
                value: formatQuantity(product.reorderLevel),
              },
              ...(canViewValues
                ? [
                    {
                      label: "Cost",
                      value: formatMoney(product.costPrice, currency),
                    },
                  ]
                : []),
            ]}
          />
        ))}
      </div>

      <ListCardSkeletons figures={canViewValues ? 3 : 2} />

      <div className="hidden overflow-x-auto rounded border border-line bg-surface min-[600px]:block">
        <table className="w-full min-w-[680px] border-collapse text-[13px]">
          <caption className="sr-only">
            Products, with SKU, category, on hand, reorder level, cost and stock
            status
          </caption>
          <thead className="border-b border-line bg-panel">
            <tr>
              <th scope="col" className={TH}>
                Product
              </th>
              <th scope="col" className={TH}>
                Category
              </th>
              <th scope="col" className={`${TH} text-right`}>
                On hand
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Reorder
              </th>
              {canViewValues ? (
                <th scope="col" className={`${TH} text-right`}>
                  Cost
                </th>
              ) : null}
              <th scope="col" className={TH}>
                Status
              </th>
            </tr>
          </thead>
          <tbody data-rows>
            {products.map((product) => {
              const status = stockStatus(product.onHand, product.reorderLevel);
              return (
                <tr
                  key={product.id}
                  className="border-b border-line last:border-b-0 hover:bg-panel"
                >
                  <td className={`${TD} border-l-2 border-transparent`}>
                    {/* The open row is marked by the link's own state, because the
                        panel opens without a page render. */}
                    <PanelLink
                      href={rowHref(product.id)}
                      className="font-medium hover:text-accent"
                    >
                      {product.name}
                    </PanelLink>
                    <span className="ml-2 font-mono text-[11px] text-ink-faint">
                      {product.sku}
                    </span>
                    {product.isArchived ? (
                      <span className="ml-2 rounded border border-line px-1.5 py-0.5 text-[10px] tracking-[0.06em] text-ink-muted uppercase">
                        Archived
                      </span>
                    ) : null}
                  </td>
                  <td className={`${TD} text-ink-muted`}>
                    {product.categoryName ?? "—"}
                  </td>
                  <td className={`${TD} text-right font-mono`}>
                    {formatQuantity(product.onHand)}
                  </td>
                  <td className={`${TD} text-right font-mono text-ink-muted`}>
                    {formatQuantity(product.reorderLevel)}
                  </td>
                  {canViewValues ? (
                    <td className={`${TD} text-right font-mono`}>
                      {formatMoney(product.costPrice, currency)}
                    </td>
                  ) : null}
                  <td className={`${TD} text-ink-muted`}>
                    <StatusLabel status={status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
          {/* Shown by `[data-busy="true"]` while a page or filter change is in
              flight, so the rows are replaced in place instead of the page. */}
          <tbody
            data-skeleton
            aria-hidden
            className="animate-pulse motion-reduce:animate-none"
          >
            {Array.from({ length: 8 }, (_, row) => (
              <tr key={row} className="border-b border-line last:border-b-0">
                {Array.from({ length: canViewValues ? 6 : 5 }, (_, column) => (
                  <td key={column} className={TD}>
                    <span
                      className={`block h-3 rounded bg-line ${
                        column === 0 ? "w-32" : "w-10"
                      }`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
