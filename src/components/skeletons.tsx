/**
 * Loading placeholders for the shell. They reserve the same space as the real
 * content so the layout does not jump when the business query resolves, and they
 * are hidden from assistive tech: the wrapper announces "Loading" instead.
 */

export function BusinessSwitcherSkeleton() {
  return (
    <div className="flex items-center gap-2" aria-hidden>
      <span className="hidden h-3 w-14 rounded bg-line sm:block" />
      <span className="h-9 w-[150px] animate-pulse rounded border border-line bg-panel motion-reduce:animate-none" />
      <span className="hidden h-4 w-10 rounded border border-line bg-panel sm:block" />
    </div>
  );
}

export function LoadingAnnouncement({ label }: { label: string }) {
  return (
    <span className="sr-only" role="status">
      {label}
    </span>
  );
}

export function ContentSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="h-2.5 w-20 rounded bg-line" />
        <span className="h-5 w-44 rounded bg-line" />
        <span className="h-2.5 w-64 rounded bg-line/70" />
      </div>

      <div className="grid grid-cols-2 gap-2 min-[600px]:grid-cols-4">
        {[0, 1, 2, 3].map((cell) => (
          <div
            key={cell}
            className="h-[68px] rounded border border-line bg-panel"
          />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <span className="h-2.5 w-16 rounded bg-line" />
        <div className="grid gap-2 min-[600px]:grid-cols-2">
          {[0, 1, 2, 3, 4, 5].map((cell) => (
            <div
              key={cell}
              className="h-[52px] rounded border border-line bg-panel"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
