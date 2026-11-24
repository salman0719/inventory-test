"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { isPanelOpen, usePanels } from "./panel-host";
import { PanelLink } from "./panel-link";
import { useCompact } from "./use-compact";
import { useModalSheet } from "./use-modal-sheet";

/**
 * The contextual panel that opens beside a list.
 *
 * From 900px it is the sticky column the design specifies. Below that it is the
 * chosen sheet: 86% of the screen over the dimmed list, the record's head pinned,
 * its body scrolling and its actions pinned above the home indicator. It covers
 * the tab bar, so there is one obvious way out — the scrim, Close or Escape.
 *
 * It rises on mount and slides back down when it closes, the same 220ms as the
 * More sheet (0009). Closing only removes the row from the URL, so the grid keeps
 * the panel mounted until the slide ends (`PanelGrid`); while it is leaving it is
 * `inert` and `aria-hidden`, exactly as the closed More sheet is, so it is only
 * on screen for the transition.
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
  const { close, href } = usePanels();
  const compact = useCompact();
  // The panel's own state, read from the same URL the grid reads: a panel that is
  // still mounted for its exit is closed.
  const open = isPanelOpen(href);
  const sheetOpen = compact && open;
  const returnTo = useRef<HTMLElement | null>(null);

  const returnFocus = useCallback(() => {
    const target = returnTo.current;
    returnTo.current = null;
    if (target && target !== document.body && target.isConnected) {
      target.focus({ preventScroll: true });
    }
  }, []);

  // The row link has focus when the panel opens; the sheet takes it a commit
  // later. This effect is declared before the sheet's own effects, so it
  // captures the row rather than the sheet. Effect bodies run in the order their
  // hooks were called, which is why the sheet hook follows.
  useEffect(() => {
    returnTo.current = document.activeElement as HTMLElement | null;
    // A route change while the panel is open unmounts it without a close, and
    // the row it came from is gone with the list.
    return returnFocus;
  }, [returnFocus]);

  // Focus goes back to the row as the sheet starts leaving, not when it unmounts
  // 220ms later: by then the sheet is inert, and a modal element that cannot hold
  // focus would leave the browser with none.
  useEffect(() => {
    if (!open) returnFocus();
  }, [open, returnFocus]);

  const { sheetRef, onKeyDown } = useModalSheet(sheetOpen, close, {
    inertPage: false,
  });

  return (
    <>
      {/* A panel link, so closing does not re-render the page. Without a panel
          provider above it, it is an ordinary link. */}
      <PanelLink
        href={closeHref}
        aria-label={`Close ${label}`}
        tabIndex={-1}
        aria-hidden={!open}
        inert={!open}
        className={`fixed inset-0 z-40 bg-scrim transition-opacity duration-[180ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] motion-reduce:transition-none min-[900px]:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      {/* The same element is the sheet below 900px and the grid's second column
          above it: a duplicate tree would duplicate every form and link in it.
          The sheet's rise is the `sheet-up` keyframe on `.panel-sheet`; its exit
          is the `translate` this close state sets, transitioned by the class
          below. The column has neither. */}
      <div
        ref={sheetRef}
        role={compact ? "dialog" : undefined}
        aria-modal={compact ? "true" : undefined}
        aria-label={compact ? label : undefined}
        aria-hidden={!open}
        inert={!open}
        tabIndex={compact ? -1 : undefined}
        onKeyDown={compact ? onKeyDown : undefined}
        className={`panel-sheet fixed inset-x-0 bottom-0 z-50 flex max-h-[86vh] flex-col overflow-hidden rounded-t-2xl border-t border-line bg-surface shadow-lg outline-none transition-transform duration-[220ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] motion-reduce:transition-none min-[900px]:static min-[900px]:z-auto min-[900px]:col-start-2 min-[900px]:row-start-1 min-[900px]:sticky min-[900px]:top-3 min-[900px]:max-h-none min-[900px]:overflow-visible min-[900px]:rounded-none min-[900px]:border-0 min-[900px]:bg-transparent min-[900px]:shadow-none min-[900px]:translate-y-0 min-[900px]:transition-none ${
          compact && !open ? "translate-y-[105%]" : ""
        }`}
      >
        <div
          aria-hidden
          className="flex flex-none justify-center pt-2 min-[900px]:hidden"
        >
          <span className="h-1 w-9 rounded-full bg-line" />
        </div>
        {children}
      </div>
    </>
  );
}
