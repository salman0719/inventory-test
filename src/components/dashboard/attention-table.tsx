import Link from "next/link";
import { formatQuantity, stockStatus } from "@/lib/product-input";
import type { AttentionItem } from "@/lib/dashboard";
import { StatusLabel } from "@/components/products/status-label";

const TH =
  "px-2.5 py-1.5 text-left text-[10px] font-medium uppercase tracking-[0.07em] text-ink-muted";
const TD = "px-2.5 py-1.5 align-middle";

/**
 * Out of stock first, then low, because that is the order in which they stop
 * service. On order sits next to on hand so the reader can tell whether a shortage
 * is already being fixed.
 */
export function AttentionTable({
  items,
  total,
  limit,
}: {
  items: AttentionItem[];
  total: number;
  limit: number;
}) {
  return (
    <div className="rounded border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-3 py-2">
        <h2 className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
          Needs attention
        </h2>
        <p className="text-[11px] text-ink-faint">
          {total} product{total === 1 ? "" : "s"} at or below the reorder level
        </p>
        <Link
          href="/inventory"
          className="ml-auto inline-flex min-h-[36px] items-center text-[11px] font-medium text-accent hover:underline"
        >
          Open inventory
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="px-3 py-8 text-center">
          <p className="text-[13px] font-medium">Nothing needs attention</p>
          <p className="mx-auto mt-1 max-w-[46ch] text-[12px] text-ink-muted">
            Every active product is above its reorder level. New shortages
            appear here as soon as stock crosses it.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse text-[13px]">
            <caption className="sr-only">
              Products out of stock or at their reorder level, with on-hand,
              reorder level, quantity on order and supplier
            </caption>
            <thead className="border-b border-line bg-panel">
              <tr>
                <th scope="col" className={TH}>
                  Product
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  On hand
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Reorder
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  On order
                </th>
                <th scope="col" className={TH}>
                  Supplier
                </th>
                <th scope="col" className={TH}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const status = stockStatus(item.onHand, item.reorderLevel);
                return (
                  <tr
                    key={item.id}
                    className="border-b border-line last:border-b-0 hover:bg-panel"
                  >
                    <td className={`${TD} border-l-2 border-transparent`}>
                      <Link
                        href={`/inventory?product=${item.id}`}
                        className="font-medium hover:text-accent"
                      >
                        {item.name}
                      </Link>
                      <span className="ml-2 font-mono text-[11px] text-ink-faint">
                        {item.sku}
                      </span>
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
                    <td
                      className={`${TD} text-right font-mono ${
                        Number(item.onOrder) > 0
                          ? "text-accent"
                          : "text-ink-faint"
                      }`}
                    >
                      {Number(item.onOrder) > 0
                        ? formatQuantity(item.onOrder)
                        : "—"}
                    </td>
                    <td className={`${TD} text-ink-muted`}>
                      {item.supplierName ?? "—"}
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
      )}

      {items.length > 0 && total > limit ? (
        <p className="border-t border-line px-3 py-1.5 text-[11px] text-ink-faint">
          Showing the {limit} most urgent of {total}.{" "}
          <Link
            href="/inventory"
            className="font-medium text-accent hover:underline"
          >
            See the rest in inventory
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
