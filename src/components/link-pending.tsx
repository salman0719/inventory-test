"use client";

import { useLinkStatus } from "next/link";
import { RouteProgress } from "./route-progress";

export type PendingCue = "bar" | "dot" | "bar-and-dot";

/**
 * The signal a link shows between its click and the next route committing.
 *
 * It has to render inside the `<Link>` it belongs to: `useLinkStatus` reports the
 * navigation started by the link that encloses it, and nothing else. `bar` is the
 * viewport-level line and suits any link; `dot` is the rail's corner marker, which
 * needs the anchor to be positioned; `bar-and-dot` is both.
 */
export function LinkPending({ cue = "bar" }: { cue?: PendingCue }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return (
    <>
      {cue === "dot" ? null : <RouteProgress active />}
      {cue === "bar" ? null : (
        <span
          aria-hidden
          data-link-pending="true"
          className="absolute right-1.5 top-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-accent motion-reduce:animate-none"
        />
      )}
    </>
  );
}
