// @vitest-environment jsdom
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_PRODUCT } from "@/lib/product-defaults";
import { EMPTY_SUPPLIER } from "@/lib/supplier-defaults";

/**
 * A rejected save must not cost the operator the form they just filled in.
 *
 * React resets an uncontrolled form after every action, so both forms keep their
 * fields in state; these tests submit, let the action return an error, and check
 * the values are still on screen. The action modules are mocked because they open
 * a database transaction and redirect on success.
 */

const mocks = vi.hoisted(() => ({
  saveProduct: vi.fn(),
  saveSupplier: vi.fn(),
}));

vi.mock("@/app/(app)/products/actions", () => ({
  saveProduct: mocks.saveProduct,
  setArchived: vi.fn(),
}));

vi.mock("@/app/(app)/suppliers/actions", () => ({
  saveSupplier: mocks.saveSupplier,
  setArchived: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: (props: { href: string; children?: unknown; className?: string }) =>
    createElement(
      "a",
      { href: props.href, className: props.className },
      props.children as never,
    ),
}));

const { ProductForm } = await import("@/components/products/product-form");
const { SupplierForm } = await import("@/components/suppliers/supplier-form");

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

/** Type into a field the way a browser does, so React sees the change. */
function typeInto(selector: string, value: string) {
  const element = container.querySelector<
    HTMLInputElement | HTMLTextAreaElement
  >(selector);
  if (!element) throw new Error(`No field ${selector}`);
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  act(() => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function readValue(selector: string): string {
  const element = container.querySelector<
    HTMLInputElement | HTMLTextAreaElement
  >(selector);
  if (!element) throw new Error(`No field ${selector}`);
  return element.value;
}

async function submit() {
  const form = container.querySelector("form");
  if (!form) throw new Error("No form rendered");
  await act(async () => {
    form.requestSubmit();
  });
}

describe("product form retention", () => {
  it("keeps the typed product when the save is rejected", async () => {
    mocks.saveProduct.mockResolvedValue({
      error: "That SKU is already used in this business.",
    });

    await act(async () => {
      root.render(
        createElement(ProductForm, {
          defaults: EMPTY_PRODUCT,
          categories: [],
          suppliers: [],
          links: [],
          cancelHref: "/products",
        }),
      );
    });

    typeInto('[name="name"]', "Journey Apples");
    typeInto('[name="sku"]', "JRN-001");
    typeInto('[name="costPrice"]', "9.99");
    typeInto('[name="reorderLevel"]', "3");

    await submit();
    await vi.waitFor(() => {
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        "already used",
      );
    });

    expect(readValue('[name="name"]')).toBe("Journey Apples");
    expect(readValue('[name="sku"]')).toBe("JRN-001");
    expect(readValue('[name="costPrice"]')).toBe("9.99");
    expect(readValue('[name="reorderLevel"]')).toBe("3");

    const posted = mocks.saveProduct.mock.calls[0]?.[1] as FormData;
    expect(posted.get("sku")).toBe("JRN-001");
    expect(posted.get("costPrice")).toBe("9.99");
  });
});

describe("supplier form retention", () => {
  it("keeps the typed supplier when the save is rejected", async () => {
    mocks.saveSupplier.mockResolvedValue({
      error: "Keep the name to 120 characters or fewer.",
    });

    await act(async () => {
      root.render(
        createElement(SupplierForm, {
          defaults: EMPTY_SUPPLIER,
          cancelHref: "/suppliers",
        }),
      );
    });

    typeInto('[name="name"]', "Journey Produce Co");
    typeInto('[name="contactName"]', "Rae Test");
    typeInto('[name="phone"]', "03 5555 0111");
    typeInto('[name="notes"]', "Delivers Tuesday mornings.");

    await submit();
    await vi.waitFor(() => {
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        "120 characters",
      );
    });

    expect(readValue('[name="name"]')).toBe("Journey Produce Co");
    expect(readValue('[name="contactName"]')).toBe("Rae Test");
    expect(readValue('[name="phone"]')).toBe("03 5555 0111");
    const notes =
      container.querySelector<HTMLTextAreaElement>('[name="notes"]');
    expect(notes?.value).toBe("Delivers Tuesday mornings.");
  });
});
