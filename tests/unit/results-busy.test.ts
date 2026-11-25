// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A page or filter change cannot re-fire `loading.tsx`, so the table region carries
 * the loading state itself: the pager reports its navigation to the region, and the
 * region's `data-busy` reveals the skeleton rows the table always renders. These
 * tests cover the wiring (region flips with the link) and the markup it depends on
 * (two bodies, the skeleton hidden from assistive tech).
 */

const mocks = vi.hoisted(() => ({ pending: false }));

vi.mock("next/link", () => ({
  default: (props: { href: string; children?: unknown; className?: string }) =>
    createElement(
      "a",
      { href: props.href, className: props.className },
      props.children as never,
    ),
  useLinkStatus: () => ({ pending: mocks.pending }),
}));

const { ResultsBusy } = await import("@/components/results-busy");
const { Pagination } = await import("@/components/pagination");
const { ProductTable } = await import("@/components/products/product-table");

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
});

function tomato() {
  return {
    id: "p1",
    name: "Tomatoes",
    sku: "CAF-001",
    barcode: null,
    unitOfMeasure: "kg",
    categoryId: null,
    categoryName: null,
    costPrice: "4.20",
    sellingPrice: null,
    reorderLevel: "2",
    targetStockLevel: null,
    onHand: "18",
    description: null,
    isArchived: false,
  };
}

async function renderPager() {
  await act(async () => {
    root.render(
      createElement(
        ResultsBusy,
        null,
        createElement(Pagination, {
          page: 1,
          pageCount: 2,
          nextHref: "/products?page=2",
        }),
      ),
    );
  });
}

function region() {
  const element = container.querySelector("[data-busy]");
  if (!element) throw new Error("No results region rendered");
  return element;
}

describe("the results region", () => {
  it("reports itself busy while its pager link is in flight, then idle", async () => {
    mocks.pending = true;
    await renderPager();

    expect(region().getAttribute("data-busy")).toBe("true");
    expect(region().getAttribute("aria-busy")).toBe("true");
    expect(container.textContent).toContain("Updating results");

    mocks.pending = false;
    await renderPager();

    expect(region().getAttribute("data-busy")).toBe("false");
    expect(container.textContent).not.toContain("Updating results");
  });

  it("keeps the real rows and the skeleton in separate bodies", async () => {
    await act(async () => {
      root.render(
        createElement(ProductTable, {
          products: [tomato()],
          currency: "AUD",
          rowHref: (id: string) => `/products?product=${id}`,
        }),
      );
    });

    const rows = container.querySelector("tbody[data-rows]");
    const skeleton = container.querySelector("tbody[data-skeleton]");

    expect(rows?.querySelectorAll("tr")).toHaveLength(1);
    expect(rows?.textContent).toContain("Tomatoes");
    expect(skeleton?.querySelectorAll("tr")).toHaveLength(8);
    expect(skeleton?.getAttribute("aria-hidden")).toBe("true");
  });
});
