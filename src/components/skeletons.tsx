import type { ReactNode } from "react";

/**
 * Loading placeholders for the shell and the list screens. They reserve the same
 * space as the real content so the layout does not jump when a query resolves, and
 * they are hidden from assistive tech: the wrapper announces what is loading.
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

/**
 * The frame every route-level loading file shares: the announcement, the content
 * column the page uses, and one pulse for the whole placeholder rather than one per
 * bar.
 */
export function PageSkeleton({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-busy="true"
      className="flex animate-pulse flex-col gap-4 motion-reduce:animate-none"
    >
      <LoadingAnnouncement label={label} />
      {children}
    </section>
  );
}

/** The list header: title, the count line beside it, and the primary action. */
export function ListHeaderSkeleton({
  titleWidth = "w-24",
}: {
  titleWidth?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2" aria-hidden>
      <span className={`h-4 rounded bg-line ${titleWidth}`} />
      <span className="h-3 w-56 rounded bg-line/70" />
      <span className="ml-auto h-9 w-[112px] rounded bg-line/60" />
    </div>
  );
}

/**
 * The filter bar, one block per field. `fields` matches the real form so the bar is
 * the same height and the table does not shift down when it arrives.
 */
export function FilterBarSkeleton({ fields = 1 }: { fields?: number }) {
  return (
    <div
      className="flex flex-wrap items-end gap-2 rounded border border-line bg-panel px-2.5 py-2"
      aria-hidden
    >
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="flex flex-col gap-1">
          <span className="h-2 w-12 rounded bg-line/70" />
          <span className="h-9 w-[150px] rounded border border-line bg-surface" />
        </div>
      ))}
      <span className="h-9 w-[68px] rounded bg-line/60" />
    </div>
  );
}

/**
 * The phone's cards while a page or filter change is in flight. `globals.css`
 * reveals it from `[data-busy="true"]` below 900px and hides it again once the
 * rows arrive, the way `tbody[data-skeleton]` works for the table. A route-level
 * skeleton has no busy region, so it passes `alwaysVisible`.
 */
export function ListCardSkeletons({
  count = 4,
  figures = 3,
  alwaysVisible = false,
}: {
  count?: number;
  figures?: number;
  alwaysVisible?: boolean;
}) {
  return (
    <div
      aria-hidden
      {...(alwaysVisible ? {} : { "data-card-skeleton": true })}
      className={`animate-pulse flex-col gap-2 motion-reduce:animate-none ${
        alwaysVisible ? "flex" : ""
      }`}
    >
      {Array.from({ length: count }, (_, card) => (
        <div
          key={card}
          className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <span className="block h-3 w-32 rounded bg-line" />
              <span className="block h-2.5 w-24 rounded bg-line" />
            </div>
            <span className="block h-4 w-12 rounded-full bg-line" />
          </div>
          <div className="flex gap-4">
            {Array.from({ length: figures }, (_, figure) => (
              <span key={figure} className="block h-3 w-16 rounded bg-line" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * A list table: the header row, then `rows` body rows with the name-and-SKU pair in
 * the first column. `minWidth` matches the real table so narrow screens behave the
 * same while it loads. Below 900px the list is cards, so the skeleton is cards too
 * rather than a 680px table the phone cannot show.
 */
export function TableSkeleton({
  columns,
  rows = 8,
  minWidth = "680px",
}: {
  columns: number;
  rows?: number;
  minWidth?: string;
}) {
  return (
    <>
      <div className="min-[900px]:hidden">
        <ListCardSkeletons
          alwaysVisible
          count={4}
          figures={Math.min(Math.max(columns - 2, 1), 3)}
        />
      </div>
      <div
        className="hidden overflow-x-auto rounded border border-line bg-surface min-[900px]:block"
        aria-hidden
      >
        <table
          className="w-full border-collapse text-[13px]"
          style={{ minWidth }}
        >
          <thead className="border-b border-line bg-panel">
            <tr>
              {Array.from({ length: columns }, (_, column) => (
                <th key={column} scope="col" className="px-2.5 py-1.5">
                  <span
                    className={`block h-2 rounded bg-line ${
                      column === 0 ? "w-20" : "w-10"
                    }`}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, row) => (
              <tr key={row} className="border-b border-line last:border-b-0">
                {Array.from({ length: columns }, (_, column) => (
                  <td key={column} className="px-2.5 py-1.5">
                    {column === 0 ? (
                      <span className="flex items-center gap-2">
                        <span className="h-3 w-28 rounded bg-line" />
                        <span className="h-2.5 w-12 rounded bg-line/60" />
                      </span>
                    ) : (
                      <span
                        className={`block h-3 rounded bg-line/70 ${
                          column === columns - 1 ? "w-16" : "w-10"
                        }`}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
