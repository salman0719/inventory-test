"use client";

import { useLinkStatus } from "next/link";

/**
 * A dot on the rail item being followed, for the gap between the click and the new
 * route committing.
 *
 * A dynamic route is only shell-prefetched, and a same-route change such as a
 * filter or a page cannot re-show `loading.tsx` at all, so without this the
 * navigation can look frozen. It has to render inside the `<Link>`: that is how the
 * hook knows which navigation it belongs to.
 */
export function NavPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return (
    <span
      aria-hidden
      className="absolute right-1.5 top-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-accent motion-reduce:animate-none"
    />
  );
}
