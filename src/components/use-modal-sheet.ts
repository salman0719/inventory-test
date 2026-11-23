"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { PAGE_CONTENT_ID } from "@/lib/nav";

const FOCUSABLE =
  "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])";

/**
 * Makes a bottom sheet modal in behaviour, not only on screen.
 *
 * Focus moves into the panel without scrolling it into view: the sheet is below
 * the bottom edge when it opens, and focusing it otherwise scrolls its clipping
 * overlay to reveal it, which cancels the slide and leaves the sheet looking
 * already settled. The page column stops scrolling and leaves the tab order,
 * Escape closes, and Tab stays inside the panel.
 *
 * Returning focus to whatever opened the sheet stays with the caller: the More
 * sheet returns it only when the sheet was dismissed, and the filter sheet
 * returns it to the Filters button after Apply as well.
 */
export function useModalSheet(
  open: boolean,
  onClose: () => void,
  { inertPage = true }: { inertPage?: boolean } = {},
) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) sheetRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const page = inertPage ? document.getElementById(PAGE_CONTENT_ID) : null;
    const body = document.body.style;
    const html = document.documentElement.style;
    const previous = [body.overflow, html.overflow];
    page?.setAttribute("inert", "");
    body.overflow = "hidden";
    html.overflow = "hidden";
    return () => {
      page?.removeAttribute("inert");
      body.overflow = previous[0];
      html.overflow = previous[1];
    };
  }, [open, inertPage]);

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !sheetRef.current) return;

    // Keep Tab inside the sheet: it is modal, and everything behind it is out of
    // reach. The panel's own controls are queried every time, so a field that
    // appears or disables itself does not need to re-register anything.
    const focusable = sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
  }

  return { sheetRef, onKeyDown };
}
