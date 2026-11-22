import { formatMoney, formatQuantity, stockStatus } from "@/lib/product-input";
import type { InventoryItem } from "@/lib/stock";
import { StatusLabel } from "@/components/products/status-label";
import { PanelLink } from "../panel-link";

const TH =
  "px-2.5 py-1.5 text-left text-[10px] font-medium uppercase tracking-[0.07em] text-ink-muted";
const TD = "px-2.5 py-1.5 align-middle";

/**
 * Dense inventory table (Direction C). The status word is the same dot-and-word
 * label the product list uses, so "low" means the same thing on both screens.
 */
export function InventoryTable({
  items,
  currency,
  rowHref,
  canViewValues = true,
}: {
  items: InventoryItem[];
  currency: string;
  rowHref: (productId: string) => string;
  /** Viewers do not receive stock value. */
  canViewValues?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded border border-line bg-surface">
      <table className="w-full min-w-[700px] border-collapse text-[13px]">
        <caption className="sr-only">
          Inventory, with on-hand quantity, reorder level, stock value and
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
                Value at cost
              </th>
            ) : null}
            <th scope="col" className={TH}>
              Status
            </th>
          </tr>
        </thead>
        <tbody data-rows>
          {items.map((item) => {
            const status = stockStatus(item.onHand, item.reorderLevel);
            return (
              <tr
                key={item.id}
                className="border-b border-line last:border-b-0 hover:bg-panel"
              >
                <td className={`${TD} border-l-2 border-transparent`}>
                  {/* The open row is marked by the link's own state, because the
                      panel opens without a page render. */}
                  <PanelLink
                    href={rowHref(item.id)}
                    className="font-medium hover:text-accent"
                  >
                    {item.name}
                  </PanelLink>
                  <span className="ml-2 font-mono text-[11px] text-ink-faint">
                    {item.sku}
                  </span>
                </td>
                <td className={`${TD} text-ink-muted`}>
                  {item.categoryName ?? "—"}
                </td>
                <td className={`${TD} text-right font-mono`}>
                  {formatQuantity(item.onHand)}
                  <span className="ml-1 text-[11px] text-ink-faint">
                    {item.unitOfMeasure}
                  </span>
                </td>
                <td className={`${TD} text-right font-mono text-ink-muted`}>
                  {formatQuantity(item.reorderLevel)}
                </td>
                {canViewValues ? (
                  <td className={`${TD} text-right font-mono`}>
                    {formatMoney(item.stockValue, currency)}
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
  );
}
