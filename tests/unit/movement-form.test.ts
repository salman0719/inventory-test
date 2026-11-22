// @vitest-environment jsdom
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A rejected adjustment must leave the form exactly as the operator left it —
 * including the movement select. React's post-action form reset rewinds the
 * select's DOM value to its first option while the component still holds
 * "adjustment", which showed "Stock in" beside an adjustment-only direction field.
 */

const mocks = vi.hoisted(() => ({ recordMovement: vi.fn() }));

vi.mock("@/app/(app)/inventory/actions", () => ({
  recordMovement: mocks.recordMovement,
}));

const { MovementForm } = await import("@/components/inventory/movement-form");

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

function choose(selector: string, value: string) {
  const element = container.querySelector<HTMLSelectElement>(selector);
  if (!element) throw new Error(`No select ${selector}`);
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function typeInto(selector: string, value: string) {
  const element = container.querySelector<HTMLInputElement>(selector);
  if (!element) throw new Error(`No field ${selector}`);
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit() {
  const form = container.querySelector("form");
  if (!form) throw new Error("No form rendered");
  await act(async () => {
    form.requestSubmit();
  });
}

describe("movement form after a rejected adjustment", () => {
  it("still shows the adjustment that was submitted", async () => {
    mocks.recordMovement.mockResolvedValue({
      error: "Give a reason for the adjustment.",
    });

    await act(async () => {
      root.render(
        createElement(MovementForm, { productId: "product-1", unit: "kg" }),
      );
    });

    choose('[name="movementType"]', "adjustment");
    choose('[name="direction"]', "out");
    typeInto('[name="quantity"]', "1");

    await submit();
    await vi.waitFor(() => {
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        "Give a reason",
      );
    });

    const type = container.querySelector<HTMLSelectElement>(
      '[name="movementType"]',
    );
    const direction =
      container.querySelector<HTMLSelectElement>('[name="direction"]');
    expect(type?.value).toBe("adjustment");
    expect(direction?.value).toBe("out");
    expect(type?.options[type.selectedIndex]?.text).toBe("Adjustment");
  });
});
