// @vitest-environment jsdom
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductSummary } from "@/lib/products";
import type { SupplierSummary } from "@/lib/suppliers";

/**
 * Archive and restore must clear the one-shot `saved` notice.
 *
 * The notice is URL state (`?saved=true` from the last save), and the archive
 * form used to post without touching the URL, leaving "Product saved" over the
 * archived or restored panel. These tests submit the real panel forms with the
 * action and the router mocked, and check the action's payload and the URL the
 * panel navigates to afterwards.
 */

const mocks = vi.hoisted(() => ({
  archiveProduct: vi.fn(),
  archiveSupplier: vi.fn(),
  replace: vi.fn(),
  ui: { pathname: "/products", search: "" },
}));

vi.mock("@/app/(app)/products/actions", () => ({
  saveProduct: vi.fn(),
  setArchived: mocks.archiveProduct,
}));

vi.mock("@/app/(app)/suppliers/actions", () => ({
  saveSupplier: vi.fn(),
  setArchived: mocks.archiveSupplier,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => mocks.ui.pathname,
  useSearchParams: () => new URLSearchParams(mocks.ui.search),
}));

vi.mock("next/link", () => ({
  default: (props: { href: string; children?: unknown; className?: string }) =>
    createElement(
      "a",
      { href: props.href, className: props.className },
      props.children as never,
    ),
}));

const { ProductPanel } = await import("@/components/products/product-panel");
const { SupplierPanel } = await import("@/components/suppliers/supplier-panel");

const product: ProductSummary = {
  id: "p1",
  name: "Journey Apples",
  sku: "JRN-001",
  unitOfMeasure: "kg",
  categoryId: null,
  categoryName: null,
  supplierId: null,
  supplierName: null,
  costPrice: "3.80",
  sellingPrice: "5.00",
  reorderLevel: "4",
  onHand: "14",
  description: null,
  isArchived: false,
};

const supplier: SupplierSummary = {
  id: "s1",
  name: "Journey Produce Co",
  contactName: null,
  email: null,
  phone: null,
  address: null,
  notes: null,
  isArchived: false,
  productCount: 0,
};

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
  mocks.ui = { pathname: "/products", search: "" };
});

function renderProductPanel(isArchived: boolean) {
  return act(async () => {
    root.render(
      createElement(ProductPanel, {
        mode: "detail",
        product: { ...product, isArchived },
        categories: [],
        suppliers: [],
        currency: "AUD",
        saved: true,
        closeHref: "/products",
        editHref: "/products?product=p1&edit=true",
      }),
    );
  });
}

function renderSupplierPanel() {
  return act(async () => {
    root.render(
      createElement(SupplierPanel, {
        mode: "detail",
        supplier,
        products: [],
        saved: true,
        closeHref: "/suppliers",
        editHref: "/suppliers?supplier=s1&edit=true",
      }),
    );
  });
}

async function submitArchive(action: { mock: { calls: unknown[] } }) {
  const form = container.querySelector("form");
  if (!form) throw new Error("No archive form rendered");
  await act(async () => {
    form.requestSubmit();
  });
  await vi.waitFor(() => expect(action).toHaveBeenCalled());
}

describe("archive and restore clear the saved notice", () => {
  it("drops saved from the URL after archiving a product", async () => {
    mocks.archiveProduct.mockResolvedValue(undefined);
    mocks.ui.search = "q=apples&product=p1&saved=true";
    await renderProductPanel(false);

    expect(container.textContent).toContain("Product saved.");
    await submitArchive(mocks.archiveProduct);

    const posted = mocks.archiveProduct.mock.calls[0]?.[0] as FormData;
    expect(posted.get("id")).toBe("p1");
    expect(posted.get("archived")).toBe("true");
    expect(mocks.replace).toHaveBeenCalledWith("/products?q=apples&product=p1");
  });

  it("drops saved from the URL after restoring a product", async () => {
    mocks.archiveProduct.mockResolvedValue(undefined);
    mocks.ui.search = "product=p1&saved=true";
    await renderProductPanel(true);

    await submitArchive(mocks.archiveProduct);

    const posted = mocks.archiveProduct.mock.calls[0]?.[0] as FormData;
    expect(posted.get("archived")).toBe("false");
    expect(mocks.replace).toHaveBeenCalledWith("/products?product=p1");
  });

  it("drops saved from the URL after archiving a supplier", async () => {
    mocks.archiveSupplier.mockResolvedValue(undefined);
    mocks.ui = { pathname: "/suppliers", search: "supplier=s1&saved=true" };
    await renderSupplierPanel();

    await submitArchive(mocks.archiveSupplier);

    const posted = mocks.archiveSupplier.mock.calls[0]?.[0] as FormData;
    expect(posted.get("id")).toBe("s1");
    expect(posted.get("archived")).toBe("true");
    expect(mocks.replace).toHaveBeenCalledWith("/suppliers?supplier=s1");
  });

  it("does not navigate when there is no saved notice to clear", async () => {
    mocks.archiveSupplier.mockResolvedValue(undefined);
    mocks.ui = { pathname: "/suppliers", search: "supplier=s1" };
    await renderSupplierPanel();

    await submitArchive(mocks.archiveSupplier);

    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
