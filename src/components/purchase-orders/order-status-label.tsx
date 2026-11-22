import { ORDER_LABELS, type OrderStatus } from "@/lib/purchase-order-input";

/**
 * Status is a dot plus a word, like the stock label: colour is never the only
 * signal. Draft and cancelled are deliberately quiet; received is the only green.
 */
const TONES: Record<OrderStatus, string> = {
  draft: "bg-ink-faint",
  ordered: "bg-accent",
  partially_received: "bg-warning",
  received: "bg-success",
  cancelled: "bg-ink-faint",
};

export function OrderStatusLabel({ status }: { status: OrderStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONES[status]}`}
      />
      <span>{ORDER_LABELS[status]}</span>
    </span>
  );
}
