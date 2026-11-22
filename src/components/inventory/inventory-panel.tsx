import Link from "next/link";
import type { ReactNode } from "react";
import { formatMoney, formatQuantity, stockStatus } from "@/lib/product-input";
import { StatusLabel } from "@/components/products/status-label";
import { MOVEMENT_LABELS, formatSignedQuantity } from "@/lib/stock-input";
import type { InventoryItem, StockMovement } from "@/lib/stock";
import { MovementForm } from "./movement-form";

const BUTTON =
  "inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-2.5 text-[12px] font-medium hover:border-accent hover:text-accent";

function formatMoment(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

/**
 * Stock detail: the current position, the one control that changes it, and the
 * ledger lines behind it. History is load-bearing here — an on-hand number nobody
 * can explain is the thing an operator stops trusting.
 */
export function InventoryPanel({
  item,
  movements,
  currency,
  saved,
  closeHref,
}: {
  item: InventoryItem;
  movements: StockMovement[];
  currency: string;
  saved: boolean;
  closeHref: string;
}) {
  const status = stockStatus(item.onHand, item.reorderLevel);

  return (
    <aside
      aria-label="Stock details"
      className="rounded border border-line bg-surface"
    >
      <header className="flex items-start gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0">
          <h2 className="truncate text-[13px] font-semibold">{item.name}</h2>
          <p className="font-mono text-[10.5px] text-ink-faint">{item.sku}</p>
        </div>
        <Link
          href={closeHref}
          aria-label="Close stock panel"
          className={`${BUTTON} ml-auto shrink-0`}
        >
          Close
        </Link>
      </header>

      {saved ? (
        <p
          role="status"
          className="border-b border-line bg-success-soft px-3 py-1.5 text-[12px] text-success"
        >
          Stock updated.
        </p>
      ) : null}

      <div className="flex items-baseline gap-2 px-3 pt-3">
        <span className="font-mono text-[22px] leading-none">
          {formatQuantity(item.onHand)}
        </span>
        <span className="text-[12px] text-ink-muted">{item.unitOfMeasure}</span>
        <span className="ml-auto text-[12px] text-ink-muted">
          <StatusLabel status={status} />
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-3">
        <Value label="Reorder at">
          <span className="font-mono">{formatQuantity(item.reorderLevel)}</span>
        </Value>
        <Value label="Value at cost">
          <span className="font-mono">
            {formatMoney(item.stockValue, currency)}
          </span>
        </Value>
        <Value label="Category">{item.categoryName ?? "—"}</Value>
        <Value label="Supplier">{item.supplierName ?? "—"}</Value>
      </dl>

      {item.isArchived ? (
        <p className="border-t border-line px-3 py-2 text-[12px] text-warning">
          This product is archived, so it is hidden from the inventory list.
          Restore it on the product page to work with its stock again.
        </p>
      ) : (
        <div className="border-t border-line px-3 py-3">
          <MovementForm productId={item.id} unit={item.unitOfMeasure} />
        </div>
      )}

      <div className="border-t border-line px-3 py-2">
        <h3 className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
          Recent movements
        </h3>
        {movements.length === 0 ? (
          <p className="mt-1 text-[12px] text-ink-muted">
            No movements yet. Stock in a delivery to start the history.
          </p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {movements.map((movement) => (
              <li
                key={movement.id}
                className="flex items-baseline gap-2 text-[12px]"
              >
                <span
                  className={`w-[52px] shrink-0 text-right font-mono ${
                    Number(movement.quantityDelta) < 0
                      ? "text-danger"
                      : "text-success"
                  }`}
                >
                  {formatSignedQuantity(movement.quantityDelta)}
                </span>
                <span className="shrink-0 text-ink-muted">
                  {MOVEMENT_LABELS[movement.movementType]}
                </span>
                <span className="min-w-0 truncate text-ink-muted">
                  {movement.reason ?? ""}
                </span>
                <span className="ml-auto shrink-0 text-[10.5px] text-ink-faint">
                  {formatMoment(movement.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-line px-3 py-2">
        <Link href={`/products?product=${item.id}`} className={BUTTON}>
          Open in catalogue
        </Link>
      </div>
    </aside>
  );
}

function Value({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
        {label}
      </dt>
      <dd className="truncate text-[13px]">{children}</dd>
    </div>
  );
}
