"use client";

import { useSyncExternalStore } from "react";

/** The width below which the detail panel is the sheet rather than the column. */
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
 * True where the panel is the sheet rather than the column.
 *
 * The layout is CSS, but the dialog role, `aria-modal`, the focus trap and the
 * slide are not: a column beside a list is a region, and a modal sheet is a
 * dialog, and neither can be the other. The results grid reads the same flag,
 * because only the sheet has an exit to finish before the panel is removed.
 */
export function useCompact(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
