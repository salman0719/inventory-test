// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Applying a filter must not reload the document.
 *
 * The bars used to be plain `method="get"` forms, so a filter submit fetched the
 * shell, the session and every query again and left a blank screen in between.
 * These tests submit the real filter components with the router mocked and assert
 * the URL that gets pushed, the options that keep the scroll position, and that
 * empty fields stay out of the URL.
 */

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("next/link", () => ({
  default: (props: { href: string; children?: unknown; className?: string }) =>
    createElement(
      "a",
      { href: props.href, className: props.className },
      props.children as never,
    ),
  useLinkStatus: () => ({ pending: false }),
}));

const { ProductFilters } =
  await import("@/components/products/product-filters");
const { ResultsBusy } = await import("@/components/results-busy");
const { PurchaseOrderFilters } =
  await import("@/components/purchase-orders/purchase-order-filters");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

async function renderProducts(
  overrides: { q?: string; region?: boolean } = {},
) {
  const filters = createElement(ProductFilters, {
    q: overrides.q ?? "",
    categoryId: "",
    categories: [{ id: "c1", name: "Produce", productCount: 2 }],
    sort: "name",
    archived: false,
  });
  await act(async () => {
    root.render(
      overrides.region ? createElement(ResultsBusy, null, filters) : filters,
    );
  });
  const form = container.querySelector("form");
  if (!form) throw new Error("No filter form rendered");
  return form;
}

async function submit(form: HTMLFormElement) {
  await act(async () => {
    form.requestSubmit();
  });
}

function field(name: string): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(
    `input[name="${name}"], select[name="${name}"]`,
  );
  if (!input) throw new Error(`No field named ${name}`);
  return input;
}

describe("the list filter bar", () => {
  it("pushes the filtered URL instead of submitting the document", async () => {
    const form = await renderProducts();
    field("q").value = "apples";

    await submit(form);

    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith("/products?q=apples&sort=name", {
      scroll: false,
    });
    // The GET fallback survives for the render before hydration.
    expect(form.getAttribute("method")).toBe("get");
    expect(form.getAttribute("action")).toBe("/products");
  });

  it("drops empty fields so the URL stays readable", async () => {
    const form = await renderProducts();

    await submit(form);

    expect(mocks.push).toHaveBeenCalledWith("/products?sort=name", {
      scroll: false,
    });
  });

  it("carries a checked toggle and leaves an unchecked one out", async () => {
    const form = await renderProducts();
    field("q").value = "apples";
    field("archived").checked = true;

    await submit(form);

    expect(mocks.push).toHaveBeenCalledWith(
      "/products?q=apples&sort=name&archived=true",
      { scroll: false },
    );
  });

  it("announces for itself when no results region wraps it", async () => {
    await renderProducts();
    expect(container.querySelectorAll('form [role="status"]')).toHaveLength(1);
  });

  it("leaves the announcement to the results region when there is one", async () => {
    await renderProducts({ region: true });
    expect(container.querySelectorAll('form [role="status"]')).toHaveLength(0);
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
  });

  it("offers Clear against the bare list only while filtered", async () => {
    await renderProducts({ q: "apples" });
    expect(container.querySelector('a[href="/products"]')).not.toBeNull();

    await act(async () => root.unmount());
    root = createRoot(container);
    await renderProducts();
    expect(container.querySelector('a[href="/products"]')).toBeNull();
  });

  it("pushes the status filter from the purchase order bar", async () => {
    await act(async () => {
      root.render(
        createElement(PurchaseOrderFilters, { q: "", status: "all" }),
      );
    });
    const form = container.querySelector("form");
    if (!form) throw new Error("No filter form rendered");
    field("status").value = "open";

    await submit(form);

    expect(mocks.push).toHaveBeenCalledWith("/purchase-orders?status=open", {
      scroll: false,
    });
  });
});
