"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";

/**
 * The URL is still the filter state; the browser no longer navigates to set it.
 *
 * A native `method="get"` form throws the document away, so the shell, the session
 * and every query are fetched again and the screen is blank until the answer
 * arrives. This submits the same URL through the router inside a transition: the
 * current rows stay on screen, scroll position is kept, and Apply reports that the
 * request is in flight. `method`/`action` stay on the element so the query still
 * works before React hydrates.
 */
export function FilterForm({
  action,
  filtered,
  children,
}: {
  action: string;
  filtered: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <form
      method="get"
      action={action}
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        const search = new URLSearchParams();
        new FormData(event.currentTarget).forEach((value, key) => {
          if (typeof value === "string" && value !== "") search.set(key, value);
        });
        const query = search.toString();
        startTransition(() => {
          router.push(query === "" ? action : `${action}?${query}`, {
            scroll: false,
          });
        });
      }}
      className="flex flex-wrap items-end gap-2 rounded border border-line bg-panel px-2.5 py-2"
    >
      {children}
      <button
        type="submit"
        disabled={pending}
        className="min-h-[36px] rounded bg-accent px-3 text-[12px] font-semibold text-on-accent disabled:opacity-60"
      >
        {pending ? "Applying…" : "Apply"}
      </button>
      {filtered ? (
        <Link
          href={action}
          className="min-h-[36px] rounded border border-line bg-surface px-2.5 text-[12px] font-medium leading-[34px] hover:border-accent hover:text-accent"
        >
          Clear
        </Link>
      ) : null}
      <span role="status" className="sr-only">
        {pending ? "Updating results" : ""}
      </span>
    </form>
  );
}
