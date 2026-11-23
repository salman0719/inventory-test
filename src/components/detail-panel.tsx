"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { usePanels } from "./panel-host";
import { PanelLink } from "./panel-link";
import { useModalSheet } from "./use-modal-sheet";

const COMPACT = "(max-width: 899px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia?.(COMPACT);
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

function snapshot() {
  return window.matchMedia?.(COMPACT).matches ?? false;
}

/**
 * True where the panel is the sheet rather than the column. The layout is CSS, but
 * the dialog role, `aria-modal` and the focus trap are not: a column beside a list
 * is a region, and a modal sheet is a dialog, and neither can be the other.
 */
function useCompact(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

/**
 * The contextual panel that opens beside a list.
 *
 * From 900px it is the sticky column the design specifies. Below that it is the
 * chosen sheet: 86% of the screen over the dimmed list, the record's head pinned,
 * its body scrolling and its actions pinned above the home indicator. It covers
 * the tab bar, so there is one obvious way out — the scrim, Close or Escape.
 *
 * The sheet mounts with the panel and leaves with it; closing is a `replaceState`
 * (the panel grid drops it), which is why it rises on mount but does not slide
 * down on close.
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
  const { close } = usePanels();
  const compact = useCompact();
  const returnTo = useRef<HTMLElement | null>(null);

  // The row link has focus when the panel opens; the sheet takes it a commit
  // later, and closing gives it back. This effect is declared before the sheet's
  // own effects, so it captures the row rather than the sheet. Effect bodies run
  // in the order their hooks were called, which is why the sheet hook follows.
  useEffect(() => {
    returnTo.current = document.activeElement as HTMLElement | null;
    return () => {
      const target = returnTo.current;
      if (target && target !== document.body && target.isConnected) {
        target.focus({ preventScroll: true });
      }
    };
  }, []);

  const { sheetRef, onKeyDown } = useModalSheet(compact, close, {
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
        className="fixed inset-0 z-40 bg-scrim min-[900px]:hidden"
      />
      {/* The same element is the sheet below 900px and the grid's second column
          above it: a duplicate tree would duplicate every form and link in it. */}
      <div
        ref={sheetRef}
        role={compact ? "dialog" : undefined}
        aria-modal={compact ? "true" : undefined}
        aria-label={compact ? label : undefined}
        tabIndex={compact ? -1 : undefined}
        onKeyDown={compact ? onKeyDown : undefined}
        className="panel-sheet fixed inset-x-0 bottom-0 z-50 flex max-h-[86vh] flex-col overflow-hidden rounded-t-2xl border-t border-line bg-surface shadow-lg outline-none min-[900px]:static min-[900px]:z-auto min-[900px]:col-start-2 min-[900px]:row-start-1 min-[900px]:sticky min-[900px]:top-3 min-[900px]:max-h-none min-[900px]:overflow-visible min-[900px]:rounded-none min-[900px]:border-0 min-[900px]:bg-transparent min-[900px]:shadow-none"
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
