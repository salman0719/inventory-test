// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The phone's filter bar: search inline, everything else behind a Filters sheet.
 *
 * The sheet has to be a real dialog — it takes focus, keeps Tab inside, closes on
 * Escape and hands focus back to the button that opened it — and the form has to
 * submit the same URL the inline bar would, with the search term and the sheet's
 * fields in one `FormData`. Active filters are links to the view without that
 * filter, so removing one is a navigation rather than a state reset.
 */

const mocks = vi.hoisted(() => ({ push: vi.fn(), pending: false }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("next/link", () => ({
  default: (props: {
    href: string;
    children?: unknown;
    className?: string;
    onClick?: () => void;
    "aria-label"?: string;
  }) =>
    createElement(
      "a",
      {
        href: props.href,
        className: props.className,
        onClick: props.onClick,
        "aria-label": props["aria-label"],
      },
      props.children as never,
    ),
  useLinkStatus: () => ({ pending: mocks.pending }),
}));

const { MobileFilters } = await import("@/components/mobile-filters");
const { InventoryFilters } =
  await import("@/components/inventory/inventory-filters");
const { PurchaseOrderFilters } =
  await import("@/components/purchase-orders/purchase-order-filters");
const { SupplierFilters } =
  await import("@/components/suppliers/supplier-filters");

const fields = createElement(
  "div",
  null,
  createElement(
    "select",
    { name: "cat", defaultValue: "" },
    createElement("option", { value: "" }, "All categories"),
    createElement("option", { value: "c1" }, "Produce"),
  ),
);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.pending = false;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
  vi.clearAllMocks();
});

type Props = {
  filtered?: boolean;
  q?: string;
  chips?: { label: string; href: string }[];
};

async function render({ filtered = false, q = "", chips = [] }: Props = {}) {
  await act(async () => {
    root.render(
      createElement(
        MobileFilters,
        {
          action: "/products",
          filtered,
          q,
          searchLabel: "Search products",
          searchPlaceholder: "Name or SKU",
          chips,
        },
        fields,
      ),
    );
  });
}

function form(): HTMLFormElement {
  const element = container.querySelector("form");
  if (!element) throw new Error("No filter form rendered");
  return element;
}

function moreButton(): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(
    'button[aria-haspopup="dialog"]',
  );
  if (!button) throw new Error("No Filters button rendered");
  return button;
}

function dialog(): HTMLElement {
  const element = container.querySelector<HTMLElement>('[role="dialog"]');
  if (!element) throw new Error("No filter sheet rendered");
  return element;
}

function overlay(): HTMLElement {
  const element = dialog().parentElement;
  if (!element) throw new Error("No sheet overlay rendered");
  return element;
}

function isOpen(): boolean {
  return moreButton().getAttribute("aria-expanded") === "true";
}

async function openSheet() {
  await act(async () => {
    moreButton().click();
  });
}

async function submit() {
  await act(async () => {
    form().requestSubmit();
  });
}

async function press(key: string, shiftKey = false) {
  await act(async () => {
    const target = document.activeElement ?? dialog();
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, shiftKey, bubbles: true }),
    );
  });
}

function isInert(element: Element): boolean {
  return (
    element.hasAttribute("inert") ||
    (element as HTMLElement & { inert?: boolean }).inert === true
  );
}

describe("the phone filter bar", () => {
  it("keeps the search inline and the rest in a closed sheet", async () => {
    await render();

    expect(form().getAttribute("action")).toBe("/products");
    expect(form().getAttribute("method")).toBe("get");
    expect(
      form().querySelector<HTMLInputElement>('input[name="q"]'),
    ).not.toBeNull();
    expect(isOpen()).toBe(false);
    expect(dialog().getAttribute("aria-label")).toBe("Filters");
    expect(isInert(overlay())).toBe(true);
  });

  it("opens a modal sheet with focus inside it", async () => {
    await render();
    await openSheet();

    expect(isOpen()).toBe(true);
    expect(isInert(overlay())).toBe(false);
    expect(dialog().contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overflow).toBe("hidden");
  });

  it("counts the filters that are on and links each one away", async () => {
    await render({
      filtered: true,
      q: "apples",
      chips: [
        { label: "Category: Produce", href: "/products?q=apples" },
        { label: "Include archived", href: "/products?q=apples" },
      ],
    });

    expect(moreButton().textContent).toContain("2");
    const chip = container.querySelector<HTMLAnchorElement>(
      'a[aria-label="Remove Category: Produce filter"]',
    );
    expect(chip?.getAttribute("href")).toBe("/products?q=apples");
  });

  it("submits the search and the sheet's fields as one URL", async () => {
    await render();
    const search = form().querySelector<HTMLInputElement>('input[name="q"]');
    const category =
      form().querySelector<HTMLSelectElement>('select[name="cat"]');
    if (!search || !category) throw new Error("No fields rendered");
    search.value = "apples";
    category.value = "c1";

    await submit();

    expect(mocks.push).toHaveBeenCalledWith("/products?q=apples&cat=c1", {
      scroll: false,
    });
    // Applying closes the sheet, so the rows it changed are visible.
    expect(isOpen()).toBe(false);
  });

  it("closes on Escape and gives focus back to its button", async () => {
    await render();
    await openSheet();
    await press("Escape");

    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(moreButton());
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps Tab inside the sheet", async () => {
    await render({ filtered: true, q: "apples" });
    await openSheet();

    const close = dialog().querySelector<HTMLButtonElement>("button");
    const apply = Array.from(
      dialog().querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.type === "submit");
    if (!close || !apply) throw new Error("The sheet is missing its controls");

    apply.focus();
    await press("Tab");
    expect(document.activeElement).toBe(close);

    close.focus();
    await press("Tab", true);
    expect(document.activeElement).toBe(apply);
  });

  it("names each inventory filter and links to the view without it", async () => {
    await act(async () => {
      root.render(
        createElement(InventoryFilters, {
          q: "",
          categoryId: "c1",
          categories: [{ id: "c1", name: "Produce", productCount: 2 }],
          status: "out",
          sort: "low",
        }),
      );
    });

    const labels = Array.from(
      container.querySelectorAll("ul[aria-label='Active filters'] a"),
    ).map((chip) => chip.textContent?.trim().replace("×", ""));
    expect(labels).toEqual([
      "Category: Produce",
      "Stock: Out of stock",
      "Sort: On hand, lowest first",
    ]);

    const category = container.querySelector(
      'a[aria-label="Remove Category: Produce filter"]',
    );
    expect(category?.getAttribute("href")).toBe(
      "/inventory?status=out&sort=low",
    );
  });

  it("names the purchase order status and supplier archive filters", async () => {
    await act(async () => {
      root.render(
        createElement(PurchaseOrderFilters, { q: "", status: "open" }),
      );
    });
    expect(
      container
        .querySelector(
          'a[aria-label="Remove Status: Awaiting delivery filter"]',
        )
        ?.getAttribute("href"),
    ).toBe("/purchase-orders");

    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(SupplierFilters, { q: "ann", archived: true }));
    });
    expect(
      container
        .querySelector('a[aria-label="Remove Include archived filter"]')
        ?.getAttribute("href"),
    ).toBe("/suppliers?q=ann");
  });

  it("empties the search field when the URL loses the term", async () => {
    await render({ q: "apples" });
    const search = () =>
      form().querySelector<HTMLInputElement>('input[name="q"]');
    expect(search()?.value).toBe("apples");

    // Clear, a chip or Back can drop the term without touching the field.
    await render({ q: "" });
    expect(search()?.value).toBe("");
  });

  it("shows a filter that a chip removed, not the value it had before", async () => {
    const categories = [{ id: "c1", name: "Produce", productCount: 2 }];
    const renderInventory = async (categoryId: string) => {
      await act(async () => {
        root.render(
          createElement(InventoryFilters, {
            q: "",
            categoryId,
            categories,
            status: "all",
            sort: "name",
          }),
        );
      });
    };
    const category = () =>
      container.querySelector<HTMLSelectElement>(
        '[role="dialog"] select[name="cat"]',
      );

    await renderInventory("");
    // A category picked in the sheet makes the control dirty, which an
    // uncontrolled select would keep even after the URL dropped it.
    const picked = category();
    if (!picked) throw new Error("No category select rendered");
    picked.value = "c1";

    await renderInventory("c1");
    expect(category()?.value).toBe("c1");

    await renderInventory("");
    expect(category()?.value).toBe("");
  });

  it("offers Clear only while a filter is on", async () => {
    await render();
    expect(container.querySelector('a[href="/products"]')).toBeNull();

    await act(async () => root.unmount());
    root = createRoot(container);
    await render({ filtered: true, q: "apples" });
    expect(container.querySelector('a[href="/products"]')).not.toBeNull();
  });
});
