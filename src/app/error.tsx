"use client";

import { useEffect } from "react";
import { ErrorPanel } from "@/components/error-panel";

/**
 * Root boundary. It catches anything the shell layout throws — notably the
 * business query behind the selector — which sits above `(app)/error.tsx` and
 * would otherwise show Next's generic error page. There is no rail here because
 * the layout that draws it is what failed.
 */
export default function RootError({
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
    <main className="mx-auto flex min-h-screen w-full max-w-[640px] flex-col justify-center px-4">
      <ErrorPanel onRetry={reset} />
    </main>
  );
}
