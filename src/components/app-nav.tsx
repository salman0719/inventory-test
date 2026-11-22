"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NavPending } from "./nav-pending";

type Item = { href: string; label: string; short: string; icon: ReactNode };

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
 * Direction C navigation: a labelled dark rail from 600px up, and a horizontal
 * labelled bar below it. Labels are 10px uppercase as approved in 0006; touch
 * targets are at least 44px.
 */
export function AppNav() {
  const pathname = usePathname();

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[76px] flex-col bg-rail min-[600px]:flex">
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

      <div className="bg-rail min-[600px]:hidden">
        <div className="flex items-center gap-2 px-3 py-1.5">
          <Link
            href="/"
            className="relative shrink-0 text-[14px] font-bold tracking-tight text-surface"
            aria-label="Stk home"
          >
            Stk
            <NavPending />
          </Link>
          <nav
            aria-label="Primary"
            className="flex flex-1 gap-1 overflow-x-auto"
          >
            {ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex min-h-[44px] min-w-[56px] shrink-0 flex-col items-center justify-center gap-0.5 rounded px-2 text-[10px] uppercase tracking-[0.04em] ${
                    active
                      ? "bg-rail-active text-surface"
                      : "text-rail-ink hover:text-surface"
                  }`}
                >
                  <span aria-hidden>{item.icon}</span>
                  <span className="whitespace-nowrap uppercase tracking-[0.04em]">
                    {item.label}
                  </span>
                  <NavPending />
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </>
  );
}
