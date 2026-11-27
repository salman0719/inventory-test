import { PendingLink } from "@/components/pending-link";
import {
  REPORT_KINDS,
  REPORT_LABELS,
  type ReportKind,
} from "@/lib/report-input";

/**
 * Switching report starts a fresh view: each report has its own filters, so
 * carrying one report's search into another would show a confusing empty table.
 *
 * The five tabs fit one row on a desk. Below 600px a wrapping row left the fifth
 * tab alone beside a half-empty panel, so they are a two-column grid instead and
 * the odd one out spans the row, at a full touch height.
 */
export function ReportTabs({ kind }: { kind: ReportKind }) {
  return (
    <nav
      aria-label="Reports"
      className="grid grid-cols-2 gap-1 rounded border border-line bg-panel p-1 min-[600px]:flex min-[600px]:flex-wrap"
    >
      {REPORT_KINDS.map((option) => {
        const active = option === kind;
        return (
          <PendingLink
            key={option}
            href={`/reports?report=${option}`}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-[44px] items-center justify-center rounded px-2.5 text-[12px] min-[600px]:min-h-[32px] min-[600px]:justify-start max-[599px]:last:col-span-2 ${
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
