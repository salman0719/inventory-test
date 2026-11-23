"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { LinkPending, type PendingCue } from "./link-pending";

type LinkProps = ComponentProps<typeof Link>;

/**
 * A `<Link>` that acknowledges the click as soon as it happens.
 *
 * A route's `loading.tsx` cannot paint until that route's first bytes arrive, so on
 * a slow connection a plain link looks ignored until the new screen starts. This
 * renders the same `NextLink` with the pending signal inside it, which is the only
 * place `useLinkStatus` can see the navigation.
 *
 * It stays a real anchor with the given href, so a middle click, a new tab, a
 * shared link and the pre-hydration page behave exactly as before.
 */
export function PendingLink({
  cue = "bar",
  className,
  children,
  ...rest
}: LinkProps & { cue?: PendingCue }) {
  return (
    <Link
      {...rest}
      className={className ? `relative ${className}` : "relative"}
    >
      <LinkPending cue={cue} />
      {children}
    </Link>
  );
}
