"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { LinkBusy } from "./results-busy";

/**
 * The pager for the paginated list screens.
 *
 * Each control is still a plain `<Link>`, so the page number stays in the URL and
 * a reload renders the same page from the server; nothing about the current page
 * lives in component state. What a link cannot do on its own is say that it was
 * clicked: a `searchParams` change never re-fires `loading.tsx`, because the
 * boundary is already resolved and stays resolved. So the clicked control names
 * the page it is fetching, and reports the navigation to the table region, which
 * shows its skeleton rows until the new rows arrive.
 *
 * `useLinkStatus` only sees the navigation it is rendered inside, so the label is
 * produced by a child of the anchor rather than by the nav around it.
 */

const CONTROL =
  "inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-2.5 font-medium hover:border-accent hover:text-accent";

function PendingLabel({ label, target }: { label: string; target: number }) {
  const { pending } = useLinkStatus();

  return <>{pending ? `Loading page ${target}…` : label}</>;
}

export function Pagination({
  page,
  pageCount,
  previousHref,
  nextHref,
}: {
  page: number;
  pageCount: number;
  previousHref?: string;
  nextHref?: string;
}) {
  if (pageCount <= 1) return null;

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center gap-2 text-[12px] text-ink-muted"
    >
      {previousHref ? (
        <Link href={previousHref} className={CONTROL}>
          <LinkBusy id="pagination-previous" />
          <PendingLabel label="Previous" target={page - 1} />
        </Link>
      ) : null}
      <span>
        Page {Math.min(page, pageCount)} of {pageCount}
      </span>
      {nextHref ? (
        <Link href={nextHref} className={CONTROL}>
          <LinkBusy id="pagination-next" />
          <PendingLabel label="Next" target={page + 1} />
        </Link>
      ) : null}
    </nav>
  );
}
