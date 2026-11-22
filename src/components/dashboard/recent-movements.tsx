import Link from "next/link";
import {
  LEDGER_MOVEMENT_LABELS,
  formatSignedQuantity,
} from "@/lib/stock-input";
import type { RecentMovement } from "@/lib/dashboard";

function formatMoment(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

/**
 * The last few ledger lines across the whole business. This is the page's evidence
 * that stock is moving for reasons, not magic: every row names the product, the
 * movement type and why it happened.
 */
export function RecentMovements({
  movements,
}: {
  movements: RecentMovement[];
}) {
  return (
    <div className="rounded border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <h2 className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
          Recent movements
        </h2>
        <Link
          href="/inventory"
          className="ml-auto text-[11px] font-medium text-accent hover:underline"
        >
          Open inventory
        </Link>
      </div>

      {movements.length === 0 ? (
        <p className="px-3 py-6 text-[12px] text-ink-muted">
          No stock movements yet. Receive an order or record stock in from the
          inventory panel to start the ledger.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {movements.map((movement) => (
            <li key={movement.id}>
              <Link
                href={`/inventory?product=${movement.productId}`}
                className="flex min-h-[38px] items-baseline gap-2 px-3 py-1.5 hover:bg-panel"
              >
                <span
                  className={`w-[56px] shrink-0 text-right font-mono text-[12px] ${
                    Number(movement.quantityDelta) < 0
                      ? "text-danger"
                      : "text-success"
                  }`}
                >
                  {formatSignedQuantity(movement.quantityDelta)}
                </span>
                <span className="shrink-0 text-[11px] text-ink-muted">
                  {LEDGER_MOVEMENT_LABELS[movement.movementType]}
                </span>
                <span className="min-w-0 truncate text-[12px]">
                  {movement.productName}
                  <span className="ml-1 text-[10.5px] text-ink-faint">
                    {movement.unitOfMeasure}
                  </span>
                </span>
                <span className="ml-auto shrink-0 text-[10.5px] text-ink-faint">
                  {formatMoment(movement.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
