import { ActivityRow } from "@/components/activity/activity-row";
import { PendingLink } from "@/components/pending-link";
import type { ActivityEntry } from "@/lib/activity";

/**
 * The last few changes outside the ledger. Stock movements have their own card; this
 * is the other half of "what happened": who added, edited, ordered or received.
 */
export function RecentActivity({ entries }: { entries: ActivityEntry[] }) {
  return (
    <div className="rounded border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <h2 className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
          Recent activity
        </h2>
        <PendingLink
          href="/activity"
          className="ml-auto inline-flex min-h-[36px] items-center text-[11px] font-medium text-accent hover:underline"
        >
          Open activity
        </PendingLink>
      </div>

      {entries.length === 0 ? (
        <p className="px-3 py-6 text-[12px] text-ink-muted">
          Nothing yet. Adding a product or supplier, ordering stock or receiving
          a delivery is recorded here.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {entries.map((entry) => (
            <li key={entry.id}>
              <ActivityRow entry={entry} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
