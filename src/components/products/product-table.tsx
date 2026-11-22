import Link from "next/link";
import { formatMoney, formatQuantity, stockStatus } from "@/lib/product-input";
import type { ProductSummary } from "@/lib/products";
import { StatusLabel } from "./status-label";

const TH =
  "px-2.5 py-1.5 text-left text-[10px] font-medium uppercase tracking-[0.07em] text-ink-muted";
const TD = "px-2.5 py-1.5 align-middle";

/**
 * Dense product table (Direction C). Selecting a row loads the detail panel through
 * the URL, so the table itself stays a server component and the selection survives
 * a reload.
 */
export function ProductTable({
  products,
  currency,
  selectedId,
  canViewValues = true,
}: {
  products: ProductSummary[];
  currency: string;
  selectedId: string;
  /** Viewers do not receive cost prices. */
  canViewValues?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded border border-line bg-surface">
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
        <tbody>
          {products.map((product) => {
            const selected = product.id === selectedId;
            const status = stockStatus(product.onHand, product.reorderLevel);
            return (
              <tr
                key={product.id}
                className={`border-b border-line last:border-b-0 ${
                  selected ? "bg-accent-soft" : "hover:bg-panel"
                }`}
              >
                <td
                  className={`${TD} ${
                    selected
                      ? "border-l-2 border-accent"
                      : "border-l-2 border-transparent"
                  }`}
                >
                  <Link
                    href={`/products?product=${product.id}`}
                    aria-current={selected ? "true" : undefined}
                    className="font-medium hover:text-accent"
                  >
                    {product.name}
                  </Link>
                  <span className="ml-2 font-mono text-[11px] text-ink-faint">
                    {product.sku}
                  </span>
                  {product.isArchived ? (
                    <span className="ml-2 rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-[0.06em] text-ink-muted">
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
      </table>
    </div>
  );
}
