// @vitest-environment jsdom
import { act, createElement, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The contextual panel is the sheet below 900px and the column above it.
 *
 * The layout is CSS, but the semantics are not: only the sheet is a modal dialog,
 * and it has to take focus, close on Escape and hand focus back to the row. The
 * desktop column must stay a plain region, or the list behind it would be modal
 * with no way to dismiss it.
 */

vi.mock("next/link", () => ({
  default: (props: {
    href: string;
    children?: unknown;
    className?: string;
    tabIndex?: number;
    "aria-label"?: string;
    onClick?: () => void;
  }) =>
    createElement(
      "a",
      {
        href: props.href,
        className: props.className,
        tabIndex: props.tabIndex,
        "aria-label": props["aria-label"],
        onClick: props.onClick,
      },
      props.children as never,
    ),
}));

const { PanelProvider, PanelGrid, usePanels } =
  await import("@/components/panel-host");
const { DetailPanel } = await import("@/components/detail-panel");

/** `createElement` puts the body in the third argument, so the props type drops it. */
const Panel = DetailPanel as ComponentType<{
  closeHref: string;
  label: string;
}>;

let container: HTMLDivElement;
let root: Root;

function stubCompact(matches: boolean) {
  const media = (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
  window.matchMedia = media as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, "", "/inventory");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
  vi.restoreAllMocks();
});

/** The panel's own body, plus a control that closes it. */
function PanelBody() {
  const { close } = usePanels();
  return createElement(
    "div",
    null,
    createElement("button", { type: "button", onClick: close }, "Dismiss"),
  );
}

function View() {
  const { href } = usePanels();
  return createElement(
    "div",
    null,
    createElement("a", { href: "/inventory?product=p1" }, "Almond milk"),
    createElement("p", null, href),
  );
}

async function render(href: string) {
  await act(async () => {
    root.render(
      createElement(
        PanelProvider,
        { initialHref: href },
        createElement(
          PanelGrid,
          {
            panel: createElement(
              Panel,
              { closeHref: "/inventory", label: "Stock details" },
              createElement(PanelBody),
            ),
          },
          createElement(View),
        ),
      ),
    );
  });
}

function sheet(): HTMLElement {
  const element = container.querySelector<HTMLElement>(".panel-sheet");
  if (!element) throw new Error("No panel sheet rendered");
  return element;
}

/** jsdom does not implement `inert`; React still writes the attribute. */
function isInert(element: Element): boolean {
  return (
    element.hasAttribute("inert") ||
    (element as HTMLElement & { inert?: boolean }).inert === true
  );
}

/** Longer than the sheet's 220ms slide, so the grid has removed it. */
async function waitForExit() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 260));
  });
}

describe("the detail panel", () => {
  it("is a modal dialog over the list below 900px", async () => {
    stubCompact(true);
    await render("/inventory?product=p1");

    expect(sheet().getAttribute("role")).toBe("dialog");
    expect(sheet().getAttribute("aria-modal")).toBe("true");
    expect(sheet().getAttribute("aria-label")).toBe("Stock details");
    expect(sheet().contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overflow).toBe("hidden");

    // The scrim is the sheet's other close control; it is out of the tab order so
    // Tab starts on the panel itself.
    const scrim = container.querySelector<HTMLAnchorElement>(
      'a[aria-label="Close Stock details"]',
    );
    expect(scrim?.getAttribute("href")).toBe("/inventory");
    expect(scrim?.getAttribute("tabIndex")).toBe("-1");
  });

  it("slides out before it leaves, and gives focus back to the row", async () => {
    stubCompact(true);
    await render("/inventory");
    const row = container.querySelector<HTMLAnchorElement>(
      'a[href="/inventory?product=p1"]',
    );
    if (!row) throw new Error("No row link rendered");
    row.focus();

    // The same render with the row's href is what a click produces.
    await render("/inventory?product=p1");
    expect(sheet()).toBeTruthy();
    expect(isInert(sheet())).toBe(false);

    await act(async () => {
      sheet().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    // Closed, but still mounted for the slide: out of reach and out of the
    // accessibility tree, the same as the closed More sheet.
    expect(sheet()).toBeTruthy();
    expect(isInert(sheet())).toBe(true);
    expect(sheet().getAttribute("aria-hidden")).toBe("true");
    expect(sheet().className).toContain("translate-y-[105%]");
    expect(
      container
        .querySelector('a[aria-label="Close Stock details"]')
        ?.className.includes("opacity-0"),
    ).toBe(true);
    expect(document.activeElement).toBe(row);
    expect(document.body.style.overflow).toBe("");

    await waitForExit();
    expect(container.querySelector(".panel-sheet")).toBeNull();
  });

  it("stays a plain column above 900px", async () => {
    stubCompact(false);
    await render("/inventory?product=p1");

    expect(sheet().getAttribute("role")).toBeNull();
    expect(sheet().getAttribute("aria-modal")).toBeNull();
    expect(sheet().getAttribute("tabIndex")).toBeNull();
    expect(sheet().className).toContain("min-[900px]:static");
    expect(sheet().className).toContain("min-[900px]:transition-none");
    // No sheet on the wide layout, so there is nothing to slide out.
    expect(sheet().className).not.toContain("translate-y-[105%]");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("takes the column out of the grid in the same frame above 900px", async () => {
    stubCompact(false);
    await render("/inventory?product=p1");

    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
    });

    expect(container.querySelector(".panel-sheet")).toBeNull();
  });
});
