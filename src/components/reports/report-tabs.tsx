import { PendingLink } from "@/components/pending-link";
import {
  REPORT_KINDS,
  REPORT_LABELS,
  type ReportKind,
} from "@/lib/report-input";

/**
 * Switching report starts a fresh view: each report has its own filters, so
 * carrying one report's search into another would show a confusing empty table.
 */
export function ReportTabs({ kind }: { kind: ReportKind }) {
  return (
    <nav
      aria-label="Reports"
      className="flex flex-wrap gap-1 rounded border border-line bg-panel p-1"
    >
      {REPORT_KINDS.map((option) => {
        const active = option === kind;
        return (
          <PendingLink
            key={option}
            href={`/reports?report=${option}`}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-[32px] items-center rounded px-2.5 text-[12px] ${
              active
                ? "bg-accent-soft font-medium text-accent"
                : "text-ink-muted hover:bg-surface hover:text-ink"
            }`}
          >
            {REPORT_LABELS[option]}
          </PendingLink>
        );
      })}
    </nav>
  );
}
