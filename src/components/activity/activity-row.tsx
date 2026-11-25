import { PendingLink } from "@/components/pending-link";
import type { ActivityEntry } from "@/lib/activity";

const TIME = new Intl.DateTimeFormat("en-AU", {
  hour: "numeric",
  minute: "2-digit",
});

/** The small word beside the sentence; the summary already tells the story. */
const ACTION_LABELS: Record<string, string> = {
  "product.created": "Product added",
  "product.updated": "Product changed",
  "product.archived": "Product archived",
  "product.restored": "Product restored",
  "supplier.created": "Supplier added",
  "supplier.updated": "Supplier changed",
  "supplier.archived": "Supplier archived",
  "supplier.restored": "Supplier restored",
  "purchase_order.created": "Order drafted",
  "purchase_order.ordered": "Order sent",
  "purchase_order.cancelled": "Order cancelled",
  "purchase_order.closed_short": "Closed short",
  "receipt.recorded": "Delivery received",
  "stocktake.completed": "Stocktake",
  "import.completed": "Import",
};

export function activityLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/** The screen the event belongs to, so a row can open the thing it names. */
export function activityHref(entry: ActivityEntry): string | null {
  switch (entry.entityType) {
    case "product":
      return entry.entityId ? `/products?product=${entry.entityId}` : null;
    case "supplier":
      return entry.entityId ? `/suppliers?supplier=${entry.entityId}` : null;
    case "purchase_order":
      return entry.entityId ? `/purchase-orders?order=${entry.entityId}` : null;
    case "receipt":
      return entry.orderId ? `/purchase-orders?order=${entry.orderId}` : null;
    default:
      return null;
  }
}

/**
 * One event: when, what happened, who did it.
 *
 * The whole row is the link when the event names something that still has a screen;
 * otherwise it is plain text, because a dead link is worse than no link.
 */
export function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const href = activityHref(entry);
  const body = (
    <>
      <span className="w-[46px] shrink-0 font-mono text-[11px] text-ink-faint">
        {TIME.format(new Date(entry.createdAt))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px]">{entry.summary}</span>
        <span className="block text-[10.5px] text-ink-faint">
          {activityLabel(entry.action)} · {entry.actorName}
        </span>
      </span>
    </>
  );

  if (!href) {
    return <div className="flex items-baseline gap-2 px-3 py-2">{body}</div>;
  }

  return (
    <PendingLink
      href={href}
      className="flex items-baseline gap-2 px-3 py-2 hover:bg-surface"
    >
      {body}
    </PendingLink>
  );
}
