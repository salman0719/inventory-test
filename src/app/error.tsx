"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="rounded border border-line bg-danger-soft px-4 py-10 text-center">
      <p className="text-[13px] font-medium text-danger">
        This screen could not load
      </p>
      <p className="mx-auto mt-1 max-w-[48ch] text-[12px] text-ink-muted">
        The shell is running, but reading its data failed. Check that the
        database is up and seeded, then try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-3 text-[12px] font-medium"
      >
        Try again
      </button>
    </div>
  );
}
