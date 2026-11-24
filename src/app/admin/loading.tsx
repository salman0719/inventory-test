/**
 * The admin reads cross every tenant, so they are not request-cached like a tenant
 * page's single business. A short skeleton keeps the header and the navigation
 * usable while the counts arrive.
 */
export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div>
        <p className="text-[10px] uppercase tracking-[0.08em] text-ink-muted">
          Admin
        </p>
        <p className="mt-0.5 text-[17px] font-semibold tracking-tight text-ink-muted">
          Loading…
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 min-[900px]:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <div
            key={key}
            className="h-[74px] animate-pulse rounded border border-line bg-panel"
          />
        ))}
      </div>
      <div className="h-[120px] animate-pulse rounded border border-line bg-panel" />
    </div>
  );
}
