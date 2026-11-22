"use client";

import { useLinkStatus } from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * The region a change lands in: a table and its pager.
 *
 * A `searchParams` change cannot re-fire `loading.tsx`, and the previous rows stay
 * on screen until the new ones arrive, so the region reports itself busy and the
 * tables swap their own body for skeleton rows (see `data-skeleton` in
 * `globals.css`). The header, the columns and the filter bar never move, which is
 * the point: at 50 rows, replacing the whole screen reads as a reset.
 *
 * The busy state is reported by whatever starts the navigation — a pager link or
 * the filter form's transition — so nothing in the region has to guess.
 */

type Reporter = (id: string, pending: boolean) => void;

const BusyContext = createContext<Reporter | null>(null);

export function ResultsBusy({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());

  const report = useCallback<Reporter>((id, isPending) => {
    setPending((current) => {
      if (current.has(id) === isPending) return current;
      const next = new Set(current);
      if (isPending) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const busy = pending.size > 0;

  return (
    <BusyContext.Provider value={report}>
      <div
        data-busy={busy}
        aria-busy={busy}
        className="flex min-w-0 flex-col gap-3"
      >
        {children}
        <span role="status" className="sr-only">
          {busy ? "Updating results" : ""}
        </span>
      </div>
    </BusyContext.Provider>
  );
}

function useReportBusy(id: string, pending: boolean) {
  const report = useContext(BusyContext);

  useEffect(() => {
    if (report === null) return;
    report(id, pending);
    return () => report(id, false);
  }, [report, id, pending]);
}

/** Reports the navigation of the link it is rendered inside. */
export function LinkBusy({ id }: { id: string }) {
  const { pending } = useLinkStatus();
  useReportBusy(id, pending);
  return null;
}

/** Reports a transition that is not a link navigation, such as applying filters. */
export function TransitionBusy({
  id,
  pending,
}: {
  id: string;
  pending: boolean;
}) {
  useReportBusy(id, pending);
  return null;
}
