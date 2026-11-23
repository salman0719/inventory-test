import type { ReactNode } from "react";
import { PanelLink } from "./panel-link";

/**
 * The contextual panel that opens beside a list.
 *
 * From 900px it is the sticky column the design specifies. Below that it becomes
 * an overlay above the list with a scrim, so opening a row on a phone does not push
 * the table off the screen. Closing is a real link in both cases: the scrim is one,
 * and every panel already carries its own Close button.
 */
export function DetailPanel({
  closeHref,
  label,
  children,
}: {
  closeHref: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <>
      {/* A panel link, so closing does not re-render the page. Without a panel
          provider above it, it is an ordinary link. */}
      <PanelLink
        href={closeHref}
        aria-label={`Close ${label}`}
        tabIndex={-1}
        className="fixed inset-0 z-20 bg-scrim min-[900px]:hidden"
      />
      {/* z-40 matches the mobile tab bar and paints over it, so an open panel keeps
          the full height of the phone instead of ending behind the bar. */}
      <div className="fixed inset-x-0 bottom-0 top-[52px] z-40 overflow-y-auto overscroll-contain border-t border-line bg-surface p-3 min-[600px]:top-[46px] min-[600px]:left-[76px] min-[900px]:static min-[900px]:z-auto min-[900px]:order-last min-[900px]:overflow-visible min-[900px]:border-0 min-[900px]:bg-transparent min-[900px]:p-0">
        <div className="min-[900px]:sticky min-[900px]:top-3">{children}</div>
      </div>
    </>
  );
}
