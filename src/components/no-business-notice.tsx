/**
 * Shown by screens that need an active business when the database has none. The
 * shell no longer gates the whole page on that query, so each data screen states
 * the problem where its content would be.
 */
export function NoBusinessNotice() {
  return (
    <div className="rounded border border-dashed border-line bg-panel px-4 py-12 text-center">
      <p className="text-[13px] font-medium">No business data</p>
      <p className="mx-auto mt-1 max-w-[46ch] text-[12px] text-ink-muted">
        Start the local database and seed the two demo businesses with{" "}
        <code className="font-mono">npm run db:up</code> then{" "}
        <code className="font-mono">npm run db:seed</code>.
      </p>
    </div>
  );
}
