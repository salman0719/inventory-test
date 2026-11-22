"use client";

import Link from "next/link";
import { useContext, type ComponentProps, type MouseEvent } from "react";
import { PanelContext, isPanelOpen } from "./panel-host";

type LinkProps = Omit<ComponentProps<typeof Link>, "href" | "onClick">;

/**
 * A link that changes the panel without asking the server for a page.
 *
 * It stays a real `<Link>`: the href is right for a middle click, a new tab, a
 * shared link and the pre-hydration page. Only an ordinary left click is taken over,
 * and only when a panel provider is above it — on a screen without one it behaves
 * exactly as before.
 */
export function PanelLink({ href, ...rest }: LinkProps & { href: string }) {
  const panels = useContext(PanelContext);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (panels === null) return;
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    panels.navigate(href);
  }

  return (
    <Link
      {...rest}
      href={href}
      onClick={handleClick}
      data-panel-active={panels?.isActive(href) ? "true" : undefined}
      aria-current={
        panels?.isActive(href) && isPanelOpen(href) ? "true" : undefined
      }
    />
  );
}
