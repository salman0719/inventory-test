// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PAGE_CONTENT_ID } from "@/lib/nav";

/**
 * Direction C's phone navigation: three destinations and More on a fixed bar, the
 * other screens in a modal sheet.
 *
 * The sheet has to be modal in behaviour, not only on screen — the page and the
 * nav behind it go `inert` and the document stops scrolling — and closing must
 * give the focus back to the More button, which is itself inert until then.
 */

const mocks = vi.hoisted(() => ({ pathname: "/products" }));

vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));

vi.mock("next/link", () => ({
  default: (props: {
    href: string;
    children?: unknown;
    className?: string;
    onClick?: () => void;
    "aria-current"?: string;
    "aria-label"?: string;
  }) =>
    createElement(
      "a",
      {
        href: props.href,
        className: props.className,
        onClick: props.onClick,
        "aria-current": props["aria-current"],
        "aria-label": props["aria-label"],
      },
      props.children as never,
    ),
  useLinkStatus: () => ({ pending: false }),
}));

const { AppNav } = await import("@/components/app-nav");

let container: HTMLDivElement;
let root: Root;
let page: HTMLDivElement;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.pathname = "/products";
  container = document.createElement("div");
  // The shell's content column: what the sheet makes inert while it is open.
  page = document.createElement("div");
  page.id = PAGE_CONTENT_ID;
  page.textContent = "Page";
  document.body.append(container, page);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  page.remove();
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
});

async function render(pathname = "/products") {
  mocks.pathname = pathname;
  await act(async () => {
    root.render(createElement(AppNav));
  });
}

/** The phone bar, found by the More sheet's trigger rather than by its classes. */
function tabBar(): HTMLElement {
  const nav = moreButton().closest("nav");
  if (!nav) throw new Error("No tab bar rendered");
  return nav;
}

function tabLinks(): HTMLAnchorElement[] {
  return Array.from(tabBar().querySelectorAll("a"));
}

function moreButton(): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(
    'button[aria-haspopup="dialog"]',
  );
  if (!button) throw new Error("No More button rendered");
  return button;
}

async function openMore() {
  await act(async () => {
    moreButton().click();
  });
}

function dialog(): HTMLElement | null {
  return container.querySelector<HTMLElement>('[role="dialog"]');
}

/**
 * The sheet stays mounted while closed so the slide runs in both directions;
 * "closed" therefore means inert and out of the accessibility tree, not absent.
 */
function sheetIsOpen(): boolean {
  const sheet = dialog();
  if (!sheet) throw new Error("No sheet rendered");
  return (
    sheet.closest("[inert]") === null &&
    sheet.closest('[aria-hidden="true"]') === null
  );
}

function scatter<T extends Element>(parent: ParentNode, selector: string): T[] {
  return Array.from(parent.querySelectorAll<T>(selector));
}

async function press(key: string, shiftKey = false) {
  await act(async () => {
    const target = document.activeElement;
    if (!target) throw new Error("No focused element");
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, shiftKey, bubbles: true }),
    );
  });
}

function isInert(element: Element | null): boolean {
  if (!element) throw new Error("No element to test");
  return (
    element.hasAttribute("inert") ||
    (element as HTMLElement & { inert?: boolean }).inert === true
  );
}

describe("the phone navigation", () => {
  it("puts three primary screens and More on the bar", async () => {
    await render("/products");

    expect(tabLinks().map((link) => link.getAttribute("href"))).toEqual([
      "/",
      "/products",
      "/inventory",
    ]);
    expect(tabBar().textContent).toContain("Dash");
    expect(tabBar().textContent).toContain("Stock");
    // The sheet screens stay out of the bar; that is why More exists.
    expect(tabBar().textContent).not.toContain("Purchase orders");
    expect(tabBar().textContent).not.toContain("Settings");
    // Each tab keeps its full name for a screen reader, whatever the label says.
    expect(tabBar().textContent).toContain("Inventory");

    const more = moreButton();
    expect(more.getAttribute("aria-haspopup")).toBe("dialog");
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(more.textContent).toContain("More");
  });

  it("marks the tab for the screen it is on, and More for its own sections", async () => {
    await render("/products");
    expect(tabLinks().map((link) => link.getAttribute("aria-current"))).toEqual(
      [null, "page", null],
    );
    expect(moreButton().getAttribute("aria-current")).toBeNull();

    // A panel URL is still the list's tab, not a fourth destination.
    await render("/products/p1");
    expect(tabLinks().map((link) => link.getAttribute("aria-current"))).toEqual(
      [null, "page", null],
    );

    await render("/inventory");
    expect(tabLinks().map((link) => link.getAttribute("aria-current"))).toEqual(
      [null, null, "page"],
    );

    // No tab holds a section that lives in the sheet, so More does, and the
    // sheet's own row says which one.
    await render("/reports");
    expect(tabLinks().map((link) => link.getAttribute("aria-current"))).toEqual(
      [null, null, null],
    );
    expect(moreButton().getAttribute("aria-current")).toBe("true");

    await openMore();
    const sheet = dialog();
    if (!sheet) throw new Error("No sheet rendered");
    const reports = scatter<HTMLAnchorElement>(sheet, "a").find(
      (link) => link.getAttribute("href") === "/reports",
    );
    expect(reports?.getAttribute("aria-current")).toBe("page");
    expect(reports?.textContent).toContain("Current");
  });

  it("opens the remaining screens in a modal sheet", async () => {
    await render("/products");
    await openMore();

    expect(sheetIsOpen()).toBe(true);
    const sheet = dialog();
    if (!sheet) throw new Error("No sheet rendered");
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    expect(sheet.getAttribute("aria-label")).toBe("More");
    expect(sheet.contains(document.activeElement)).toBe(true);
    expect(
      scatter<HTMLAnchorElement>(sheet, "a").map((link) =>
        link.getAttribute("href"),
      ),
    ).toEqual([
      "/stocktake",
      "/suppliers",
      "/purchase-orders",
      "/reports",
      "/activity",
      "/settings",
    ]);
    expect(moreButton().getAttribute("aria-expanded")).toBe("true");

    // The page, the rail and the bar behind it are out of reach, and the page
    // cannot scroll underneath the sheet.
    expect(isInert(page)).toBe(true);
    expect(isInert(container.querySelector("aside"))).toBe(true);
    expect(isInert(tabBar().parentElement)).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overflow).toBe("hidden");
  });

  it("closes on Escape, restoring the page and the focus", async () => {
    await render("/products");
    await openMore();

    await press("Escape");

    expect(sheetIsOpen()).toBe(false);
    expect(moreButton().getAttribute("aria-expanded")).toBe("false");
    expect(isInert(page)).toBe(false);
    expect(isInert(tabBar().parentElement)).toBe(false);
    expect(document.documentElement.style.overflow).toBe("");
    // Focus came back to the trigger, which was inert a commit earlier.
    expect(document.activeElement).toBe(moreButton());
  });

  it("closes on the Close control and on the scrim", async () => {
    await render("/products");

    // The scrim is the dialog's sibling, so both controls are searched for in
    // the whole overlay: the labelled button in the sheet, the scrim's label.
    for (const label of ["Close", "Close menu"]) {
      await openMore();
      const control = scatter<HTMLButtonElement>(container, "button").find(
        (button) =>
          button.textContent === label ||
          button.getAttribute("aria-label") === label,
      );
      if (!control) throw new Error(`No ${label} control rendered`);

      await act(async () => {
        control.click();
      });

      expect(sheetIsOpen()).toBe(false);
      expect(document.activeElement).toBe(moreButton());
    }
  });

  it("keeps Tab inside the sheet", async () => {
    await render("/products");
    await openMore();

    const sheet = dialog();
    if (!sheet) throw new Error("No sheet rendered");
    const close = scatter<HTMLButtonElement>(sheet, "button")[0];
    const links = scatter<HTMLAnchorElement>(sheet, "a");
    const last = links[links.length - 1];
    if (!close || !last) throw new Error("The sheet has no controls");

    last.focus();
    await press("Tab");
    expect(document.activeElement).toBe(close);

    close.focus();
    await press("Tab", true);
    expect(document.activeElement).toBe(last);
  });

  it("follows a section link, leaving the page usable again", async () => {
    await render("/products");
    await openMore();

    const sheet = dialog();
    if (!sheet) throw new Error("No sheet rendered");
    const suppliers = scatter<HTMLAnchorElement>(sheet, "a").find(
      (link) => link.getAttribute("href") === "/suppliers",
    );
    if (!suppliers) throw new Error("No suppliers link rendered");
    // Next's Link cancels the default and routes; jsdom would otherwise try to
    // navigate the test document.
    suppliers.addEventListener("click", (event) => event.preventDefault());

    await act(async () => {
      suppliers.click();
    });

    expect(sheetIsOpen()).toBe(false);
    expect(isInert(page)).toBe(false);
    expect(document.body.style.overflow).toBe("");
    // The screen is changing, so focus is not pulled back to the bar.
    expect(document.activeElement).not.toBe(moreButton());
  });
});
