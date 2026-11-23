import { PendingLink } from "@/components/pending-link";
import { formatMoney } from "@/lib/product-input";
import type { DashboardSummary } from "@/lib/dashboard";

/**
 * The five figures a cafe owner checks first. Each card is the link into the screen
 * that explains it, so a number that looks wrong is one click from its detail.
 */
export function DashboardStats({
  summary,
  currency,
  canViewValues = true,
}: {
  summary: DashboardSummary;
  currency: string;
  /** Viewers see counts, never cost or value. */
  canViewValues?: boolean;
}) {
  const attention = summary.lowCount + summary.outCount;

  return (
    <section
      aria-label="Summary figures"
      className="grid grid-cols-2 gap-2 min-[600px]:grid-cols-3 min-[900px]:grid-cols-5"
    >
      <Stat
        href="/products"
        label="Products"
        value={String(summary.products)}
        note={summary.products === 1 ? "active product" : "active products"}
      />
      {canViewValues ? (
        <Stat
          href="/inventory"
          label="Stock value"
          value={formatMoney(summary.stockValue, currency)}
          note="at cost, on hand"
        />
      ) : null}
      <Stat
        href="/inventory?sort=low"
        label="Low or out"
        value={String(attention)}
        note={`${summary.outCount} out · ${summary.lowCount} low`}
        tone={attention > 0 ? "warning" : "plain"}
      />
      <Stat
        href="/purchase-orders?status=open"
        label="Open orders"
        value={String(summary.openOrders)}
        note={
          canViewValues
            ? `${formatMoney(summary.onOrderValue, currency)} on order`
            : "awaiting delivery"
        }
      />
      <Stat
        href="/suppliers"
        label="Suppliers"
        value={String(summary.suppliers)}
        note={summary.suppliers === 1 ? "active supplier" : "active suppliers"}
      />
    </section>
  );
}

function Stat({
  href,
  label,
  value,
  note,
  tone = "plain",
}: {
  href: string;
  label: string;
  value: string;
  note: string;
  tone?: "plain" | "warning";
}) {
  return (
    <PendingLink
      href={href}
      className="flex min-h-[74px] flex-col justify-center rounded border border-line bg-panel px-3 py-2 hover:border-accent"
    >
      <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
        {label}
      </span>
      <span
        className={`font-mono text-[20px] leading-tight ${
          tone === "warning" ? "text-warning" : "text-ink"
        }`}
      >
        {value}
      </span>
      <span className="text-[10.5px] text-ink-faint">{note}</span>
    </PendingLink>
  );
}
