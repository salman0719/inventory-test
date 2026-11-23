"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { PAGE_CONTENT_ID } from "@/lib/nav";
import { NavPending } from "./nav-pending";

type Item = {
  href: string;
  label: string;
  /** The rail's abbreviation: short enough to fit 76px. */
  short: string;
  /** The bottom bar's label: one word that fits a quarter of a phone. */
  tab: string;
  icon: ReactNode;
};

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const ITEMS: Item[] = [
  {
    href: "/",
    label: "Dashboard",
    short: "Dash",
    tab: "Dash",
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    href: "/products",
    label: "Products",
    short: "Prod",
    tab: "Products",
    icon: (
      <svg {...iconProps}>
        <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z" />
        <path d="M4 7.5 12 12l8-4.5M12 12v9" />
      </svg>
    ),
  },
  {
    href: "/inventory",
    label: "Inventory",
    short: "Inv",
    tab: "Stock",
    icon: (
      <svg {...iconProps}>
        <path d="M4 6h16M4 12h16M4 18h10" />
      </svg>
    ),
  },
  {
    href: "/suppliers",
    label: "Suppliers",
    short: "Supp",
    tab: "Suppliers",
    icon: (
      <svg {...iconProps}>
        <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
        <circle cx="7" cy="18" r="1.6" />
        <circle cx="17" cy="18" r="1.6" />
      </svg>
    ),
  },
  {
    href: "/purchase-orders",
    label: "Purchase orders",
    short: "POs",
    tab: "Orders",
    icon: (
      <svg {...iconProps}>
        <path d="M6 3h9l3 3v15H6z" />
        <path d="M9 9h6M9 13h6M9 17h3" />
      </svg>
    ),
  },
  {
    href: "/reports",
    label: "Reports",
    short: "Rep",
    tab: "Reports",
    icon: (
      <svg {...iconProps}>
        <path d="M4 20h16" />
        <path d="M7 20v-6M12 20V7M17 20v-9" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    short: "Set",
    tab: "Settings",
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
      </svg>
    ),
  },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The phone keeps three destinations plus More within thumb reach; the other four
 * live in the More sheet. Below 600px the old horizontal strip put 203px of its
 * 541px off-screen, so Purchase orders, Reports and Settings could not be reached
 * without guessing that it scrolled.
 */
const TAB_HREFS = ["/", "/products", "/inventory"];
const TABS = ITEMS.filter((item) => TAB_HREFS.includes(item.href));
const MORE = ITEMS.filter((item) => !TAB_HREFS.includes(item.href));

const moreIcon = (
  <svg {...iconProps}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

/** An active tab repeats the desktop rail's block; the accent is 2.3:1 on the rail. */
const tabClass = (active: boolean) =>
  `relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 rounded-[9px] px-1 py-1 text-[10px] uppercase tracking-[0.04em] transition-colors ${
    active ? "bg-rail-active font-semibold text-accent-soft" : "text-rail-ink"
  }`;

/**
 * Direction C navigation: a labelled dark rail from 600px up, and the bottom tab
 * bar below it. Labels are 10px uppercase as approved in 0006; touch targets are
 * at least 44px.
 */
export function AppNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(false);

  // The dialog takes focus when it opens, so Escape and Tab start inside it.
  // Closing puts focus back on the button that opened it, but not while it is
  // still inert: the effect below lifts that first, so this runs after it.
  useEffect(() => {
    if (moreOpen) {
      sheetRef.current?.focus();
      return;
    }
    if (returnFocus.current) {
      returnFocus.current = false;
      moreButtonRef.current?.focus();
    }
  }, [moreOpen]);

  // The sheet is modal in behaviour, not only on screen: the page and the nav
  // behind it leave the tab order and the accessibility tree, and the document
  // stops scrolling. The scrim alone only stops the pointer.
  useEffect(() => {
    if (!moreOpen) return;
    const page = document.getElementById(PAGE_CONTENT_ID);
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
  }, [moreOpen]);

  /** Any dismissal moves focus back; following a section link does not. */
  function closeMore() {
    returnFocus.current = true;
    setMoreOpen(false);
  }

  function onSheetKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeMore();
      return;
    }
    if (event.key !== "Tab" || !sheetRef.current) return;

    // Keep Tab inside the sheet: it is modal, and everything behind it is inert.
    const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled])",
    );
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

  const moreActive = MORE.some((item) => isActive(pathname, item.href));

  return (
    <>
      <aside
        inert={moreOpen}
        className="fixed inset-y-0 left-0 z-40 hidden w-[76px] flex-col bg-rail min-[600px]:flex"
      >
        <Link
          href="/"
          className="relative flex h-[52px] shrink-0 items-center justify-center text-[15px] font-bold tracking-tight text-surface"
          aria-label="Stk home"
        >
          Stk
          <NavPending />
        </Link>
        <nav aria-label="Primary" className="flex flex-1 flex-col gap-0.5 py-2">
          {ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-[58px] flex-col items-center justify-center gap-1 text-rail-ink transition-colors hover:bg-rail-active hover:text-surface ${
                  active ? "bg-rail-active text-surface" : ""
                }`}
              >
                <span aria-hidden>{item.icon}</span>
                <span
                  aria-hidden
                  className="text-[10px] uppercase tracking-[0.04em] opacity-80"
                >
                  {item.short}
                </span>
                {/* The rail is too narrow for full labels, but a screen reader
                    must hear "Purchase orders", not "POs". */}
                <span className="sr-only">{item.label}</span>
                <NavPending />
              </Link>
            );
          })}
        </nav>
      </aside>

      <div
        inert={moreOpen}
        className="fixed inset-x-0 bottom-0 z-40 min-[600px]:hidden"
      >
        <nav
          aria-label="Primary"
          className="flex items-stretch gap-0.5 bg-rail px-1 pt-1 pb-[env(safe-area-inset-bottom)]"
        >
          {TABS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={tabClass(active)}
              >
                <span aria-hidden>{item.icon}</span>
                <span aria-hidden className="whitespace-nowrap">
                  {item.tab}
                </span>
                <span className="sr-only">{item.label}</span>
                <NavPending />
              </Link>
            );
          })}
          <button
            ref={moreButtonRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            aria-current={moreActive ? "true" : undefined}
            onClick={() => setMoreOpen(true)}
            className={tabClass(moreActive)}
          >
            <span aria-hidden>{moreIcon}</span>
            <span aria-hidden>More</span>
            <span className="sr-only">More sections</span>
          </button>
        </nav>
      </div>

      {moreOpen ? (
        <div className="fixed inset-0 z-50 min-[600px]:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={closeMore}
            className="absolute inset-0 bg-scrim"
          />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="More"
            tabIndex={-1}
            onKeyDown={onSheetKeyDown}
            className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-line bg-surface shadow-lg outline-none"
          >
            <div
              aria-hidden
              className="mx-auto mt-2 h-1 w-9 rounded-full bg-line"
            />
            <div className="flex items-center gap-3 px-3 pt-2 pb-1">
              <h2 className="text-[14px] font-semibold">More</h2>
              <button
                type="button"
                onClick={closeMore}
                className="ml-auto min-h-[36px] rounded border border-line px-2.5 text-[12px] font-medium"
              >
                Close
              </button>
            </div>
            <nav
              aria-label="More sections"
              className="flex flex-col px-3 pb-[calc(12px_+_env(safe-area-inset-bottom))]"
            >
              {MORE.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-[48px] items-center gap-3 border-b border-line text-[13px] last:border-b-0 ${
                      active ? "text-accent" : "text-ink"
                    }`}
                  >
                    <span aria-hidden className="text-ink-muted">
                      {item.icon}
                    </span>
                    {item.label}
                    {active ? (
                      <span className="ml-auto text-[11px] text-ink-muted">
                        Current
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      ) : null}
    </>
  );
}
