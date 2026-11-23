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
      {/* In the panel grid the panel itself is the second column. Placing it by
          column and row rather than by order lets the table and the pager, which
          are separate grid items, stack in the first column; with `order-last`
          the pager took the panel's column and the panel fell to the next row.
          Below 600px the panel stops at the top of the tab bar: the bar is how a
          phone leaves a screen, so it stays visible and tappable. 56px is the
          bar's height (52px tabs, 4px top padding) plus the home indicator. */}
      <div className="fixed inset-x-0 bottom-[calc(56px_+_env(safe-area-inset-bottom))] top-[52px] z-30 overflow-y-auto overscroll-contain border-t border-line bg-surface p-3 min-[600px]:bottom-0 min-[600px]:top-[46px] min-[600px]:left-[76px] min-[900px]:static min-[900px]:z-auto min-[900px]:col-start-2 min-[900px]:row-start-1 min-[900px]:overflow-visible min-[900px]:border-0 min-[900px]:bg-transparent min-[900px]:p-0">
        <div className="min-[900px]:sticky min-[900px]:top-3">{children}</div>
      </div>
    </>
  );
}
