"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useCompact } from "./use-compact";

/**
 * Panel state for a list screen, held in the URL but not in the route.
 *
 * Opening a row used to be a navigation: `?product=<id>` re-rendered the page, and
 * the page fetched the list, the categories and the suppliers again to show one
 * panel. Here the URL changes through the History API, which Next folds into the
 * router without asking the server for a render, so the click costs one small JSON
 * request instead of a page.
 *
 * Opening pushes an entry and closing replaces it, so Back from an open panel closes
 * the panel instead of leaving the screen. Back and forward are read back from
 * `location`, which keeps the panel and the address bar in step.
 *
 * The URL is still the state: a reload, a shared link or a server action's redirect
 * arrive with the same query string, and `initialHref` puts the panel back.
 */

/** The id each screen uses for the open row; a route only ever uses one of them. */
const ID_KEYS = ["product", "supplier", "order"] as const;

const PANEL_KEYS = [...ID_KEYS, "new", "edit", "saved"] as const;

type PanelContextValue = {
  /** The current view, panel params included. */
  href: string;
  closeHref: string;
  /** Open a panel (pushes), or close one (replaces). */
  navigate: (href: string) => void;
  close: () => void;
  /** True when `href` points at the row the panel is showing. */
  isActive: (href: string) => boolean;
};

export const PanelContext = createContext<PanelContextValue | null>(null);

function parse(href: string): URLSearchParams {
  return new URL(href, "http://panel.local").searchParams;
}

/** Drop the panel's own params, keeping filters, sort and page. */
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
  return (
    params.get("new") === "true" ||
    ID_KEYS.some((key) => params.get(key) !== null)
  );
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

  const navigate = useCallback((next: string) => {
    setOverride(next);
    // Opening is a step forward the browser can undo; closing is not a new place.
    if (isPanelOpen(next)) window.history.pushState(null, "", next);
    else window.history.replaceState(null, "", next);
  }, []);

  // Back and forward: adopt whatever the address bar says, so the panel follows the
  // history entry instead of staying on the row that was open before.
  useEffect(() => {
    const sync = () => {
      const current = `${window.location.pathname}${window.location.search}`;
      setOverride(current === initialHref ? null : current);
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [initialHref]);

  const value = useMemo<PanelContextValue>(() => {
    const current = parse(href);
    return {
      href,
      closeHref: hrefWithoutPanel(href),
      navigate,
      close: () => navigate(hrefWithoutPanel(href)),
      isActive: (candidate: string) => {
        const other = parse(candidate);
        return ID_KEYS.some((key) => {
          const value = current.get(key);
          return value !== null && other.get(key) === value;
        });
      },
    };
  }, [href, navigate]);

  return (
    <PanelContext.Provider value={value}>{children}</PanelContext.Provider>
  );
}

/**
 * The two-column grid: the panel appears in the second column only while open.
 *
 * Below 900px `open` is not the same as `mounted`: closing removes the row from
 * the URL, and the sheet then needs its 220ms to slide out before React may take
 * it away. `leaving` holds it for exactly that long, which is why the More sheet
 * keeps its overlay mounted while closed (0009) — there is nothing to animate
 * once the element is gone. Above 900px the column has no exit, so it leaves at
 * once and the list takes the full width in the same frame.
 */
const SHEET_EXIT_MS = 220;

export function PanelGrid({
  panel,
  label,
  children,
}: {
  panel: ReactNode;
  /** Announced when a panel opens, e.g. "Product details". */
  label?: string;
  children?: ReactNode;
}) {
  const { href } = usePanels();
  const open = isPanelOpen(href);
  const compact = useCompact();
  const [wasOpen, setWasOpen] = useState(open);
  const [leaving, setLeaving] = useState(false);

  // Adjusting state during render is React's pattern for a prop that changed:
  // the panel has to stay rendered in the very commit that closes it, or it is
  // already gone before the browser can transition it.
  if (wasOpen !== open) {
    setWasOpen(open);
    setLeaving(wasOpen && !open && compact);
  }

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setLeaving(false), SHEET_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  const mounted = open || leaving;

  return (
    <div
      className={`grid gap-3 ${
        open
          ? "min-[900px]:grid-cols-[minmax(0,1fr)_360px] min-[900px]:items-start"
          : ""
      }`}
    >
      {/* Opening a panel is a sighted event on a phone (it covers the list) and a
          silent one everywhere else; this one sentence is the whole announcement,
          which is why the panel's skeleton stays quiet. */}
      {label ? (
        <span role="status" className="sr-only">
          {open ? `${label} opened` : ""}
        </span>
      ) : null}
      {mounted ? panel : null}
      {children}
    </div>
  );
}
