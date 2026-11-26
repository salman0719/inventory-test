import type { CsvImportSummary } from "@/lib/csv-import";

export function ImportHistory({ history }: { history: CsvImportSummary[] }) {
  if (history.length === 0) return null;

  return (
    <section className="rounded border border-line bg-surface">
      <header className="border-b border-line px-3 py-2">
        <h2 className="text-[13px] font-semibold">Recent imports</h2>
        <p className="text-[11px] text-ink-muted">
          The last eight runs in this business.
        </p>
      </header>
      <ul className="divide-y divide-line">
        {history.map((entry) => (
          <li
            key={entry.id}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-1.5 text-[12px]"
          >
            <span className="font-medium">{entry.filename}</span>
            <span className="rounded bg-panel px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
              {entry.kind === "suppliers" ? "Suppliers" : "Products"}
            </span>
            <span className="font-mono text-[11px] text-ink-faint">
              {entry.createdAt.slice(0, 10)}
            </span>
            <span className="ml-auto text-[11px] text-ink-muted">
              {entry.importedRows} new · {entry.updatedRows} updated ·{" "}
              {entry.skippedRows} skipped
              {entry.openingMovements > 0
                ? ` · ${entry.openingMovements} opening`
                : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
