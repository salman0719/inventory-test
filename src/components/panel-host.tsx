"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Panel state for a list screen, held in the URL but not in the route.
 *
 * Opening a row used to be a navigation: `?product=<id>` re-rendered the page, and
 * the page fetched the list, the categories and the suppliers again to show one
 * panel. Here the URL changes through `history.replaceState`, which Next folds into
 * the router without asking the server for a render, so the click costs one small
 * JSON request instead of a page.
 *
 * The URL is still the state: a reload, a shared link or a server action's redirect
 * arrive with the same query string, and `initialHref` puts the panel back.
 */

const PANEL_KEYS = ["product", "new", "edit", "saved"] as const;

type PanelContextValue = {
  /** The current view, panel params included. */
  href: string;
  closeHref: string;
  open: (href: string) => void;
  close: () => void;
  /** True when the product in `href` is the one the panel is showing. */
  isActiveProduct: (href: string) => boolean;
};

export const PanelContext = createContext<PanelContextValue | null>(null);

function parse(href: string): URLSearchParams {
  return new URL(href, "http://panel.local").searchParams;
}

/** Drop the panel's own params, keeping filters, sort, page and the saved flag out. */
export function hrefWithoutPanel(href: string): string {
  const url = new URL(href, "http://panel.local");
  for (const key of PANEL_KEYS) url.searchParams.delete(key);
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}`;
}

/** A copy of `href` with one panel param changed (`null` removes it). */
export function hrefWithPanel(
  href: string,
  changes: Partial<Record<(typeof PANEL_KEYS)[number], string | null>>,
): string {
  const url = new URL(href, "http://panel.local");
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}`;
}

export function isPanelOpen(href: string): boolean {
  const params = parse(href);
  return params.get("new") === "true" || params.get("product") !== null;
}

export function usePanels(): PanelContextValue {
  const value = useContext(PanelContext);
  if (value === null) {
    throw new Error("Panel components must render inside PanelProvider.");
  }
  return value;
}

export function PanelProvider({
  initialHref,
  children,
}: {
  initialHref: string;
  children?: ReactNode;
}) {
  // The client's own URL wins while it is set; a server render (a mutation's
  // redirect, a filter push) is the authority again, so the override is dropped
  // when the URL the server rendered changes. Adjusting state during render is
  // React's documented pattern for that, and avoids a second render in an effect.
  const [serverHref, setServerHref] = useState(initialHref);
  const [override, setOverride] = useState<string | null>(null);
  if (serverHref !== initialHref) {
    setServerHref(initialHref);
    setOverride(null);
  }
  const href = override ?? initialHref;

  const open = useCallback((next: string) => {
    setOverride(next);
    window.history.replaceState(null, "", next);
  }, []);

  const value = useMemo<PanelContextValue>(() => {
    const productId = parse(href).get("product");
    return {
      href,
      closeHref: hrefWithoutPanel(href),
      open,
      close: () => open(hrefWithoutPanel(href)),
      isActiveProduct: (candidate: string) => {
        const candidateId = parse(candidate).get("product");
        return productId !== null && candidateId === productId;
      },
    };
  }, [href, open]);

  return (
    <PanelContext.Provider value={value}>{children}</PanelContext.Provider>
  );
}

/** The two-column grid: the panel appears in the second column only while open. */
export function PanelGrid({
  panel,
  children,
}: {
  panel: ReactNode;
  children?: ReactNode;
}) {
  const { href } = usePanels();
  const open = isPanelOpen(href);

  return (
    <div
      className={`grid gap-3 ${
        open
          ? "min-[900px]:grid-cols-[minmax(0,1fr)_360px] min-[900px]:items-start"
          : ""
      }`}
    >
      {open ? panel : null}
      {children}
    </div>
  );
}
