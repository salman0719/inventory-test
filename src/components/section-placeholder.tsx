import Link from "next/link";

/**
 * Shared shell for sections that are not built yet. It states what is coming and
 * when, rather than showing controls that do nothing.
 */
export function SectionPlaceholder({
  title,
  description,
  emptyTitle,
  emptyBody,
  nextHref,
  nextLabel,
}: {
  title: string;
  description: string;
  emptyTitle: string;
  emptyBody: string;
  nextHref?: string;
  nextLabel?: string;
}) {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-[15px] font-semibold tracking-tight">{title}</h1>
        <p className="text-[12px] text-ink-muted">{description}</p>
      </header>
      <div className="rounded border border-dashed border-line bg-panel px-4 py-12 text-center">
        <p className="text-[13px] font-medium">{emptyTitle}</p>
        <p className="mx-auto mt-1 max-w-[48ch] text-[12px] text-ink-muted">
          {emptyBody}
        </p>
        {nextHref && nextLabel ? (
          <Link
            href={nextHref}
            className="mt-4 inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-3 text-[12px] font-medium hover:border-accent hover:text-accent"
          >
            {nextLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
