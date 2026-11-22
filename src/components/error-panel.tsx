/**
 * The app's error panel, shared by the shell boundary (`(app)/error.tsx`) and the
 * root boundary (`app/error.tsx`). The root one exists because a failure in the
 * shell layout — reading the businesses for the selector — happens above the
 * shell's own boundary and would otherwise fall through to Next's generic page.
 *
 * The copy avoids promising that the shell is running: it may not be.
 */
export function ErrorPanel({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded border border-line bg-danger-soft px-4 py-10 text-center">
      <p className="text-[13px] font-medium text-danger">
        This screen could not load
      </p>
      <p className="mx-auto mt-1 max-w-[48ch] text-[12px] text-ink-muted">
        Stk could not read this screen&rsquo;s data. Check that the database is
        up and seeded, then try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-3 text-[12px] font-medium"
      >
        Try again
      </button>
    </div>
  );
}
