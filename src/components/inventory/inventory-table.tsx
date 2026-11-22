import Link from "next/link";
import { formatMoney, formatQuantity, stockStatus } from "@/lib/product-input";
import type { InventoryItem } from "@/lib/stock";
import { StatusLabel } from "@/components/products/status-label";

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
  selectedId,
  rowHref,
}: {
  items: InventoryItem[];
  currency: string;
  selectedId: string;
  rowHref: (productId: string) => string;
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
            <th scope="col" className={`${TH} text-right`}>
              Value at cost
            </th>
            <th scope="col" className={TH}>
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const selected = item.id === selectedId;
            const status = stockStatus(item.onHand, item.reorderLevel);
            return (
              <tr
                key={item.id}
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
                    href={rowHref(item.id)}
                    aria-current={selected ? "true" : undefined}
                    className="font-medium hover:text-accent"
                  >
                    {item.name}
                  </Link>
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
                <td className={`${TD} text-right font-mono`}>
                  {formatMoney(item.stockValue, currency)}
                </td>
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
