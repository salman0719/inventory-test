// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A row click must not become a page render. The provider keeps the view in the URL
 * through `history.replaceState`, and the link takes over only an ordinary left
 * click — everything else (new tab, middle click, no provider at all) stays a link.
 */

vi.mock("next/link", () => ({
  default: (props: {
    href: string;
    children?: unknown;
    className?: string;
    "data-panel-active"?: string;
    "aria-current"?: string;
    onClick?: (event: unknown) => void;
  }) =>
    createElement(
      "a",
      {
        href: props.href,
        className: props.className,
        "data-panel-active": props["data-panel-active"],
        "aria-current": props["aria-current"],
        onClick: props.onClick,
      },
      props.children as never,
    ),
}));

const { PanelProvider, PanelGrid, usePanels } =
  await import("@/components/panel-host");
const { PanelLink } = await import("@/components/panel-link");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, "", "/products");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function View() {
  const { href, close } = usePanels();
  return createElement(
    "div",
    null,
    createElement("p", { "data-href": href }, href),
    createElement(
      PanelLink,
      { href: "/products?q=apples&product=p1" },
      "Tomatoes",
    ),
    createElement("button", { type: "button", onClick: close }, "Close"),
  );
}

async function render(initialHref: string) {
  await act(async () => {
    root.render(
      createElement(
        PanelProvider,
        { initialHref },
        createElement(
          PanelGrid,
          { panel: createElement("aside", { "data-panel": "open" }, "panel") },
          createElement(View),
        ),
      ),
    );
  });
}

function click() {
  const link = container.querySelector("a");
  if (!link) throw new Error("No link rendered");
  return act(async () => {
    link.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
    );
  });
}

describe("the panel provider", () => {
  it("opens a row without a navigation and records it in the URL", async () => {
    await render("/products?q=apples");
    expect(container.querySelector("[data-panel]")).toBeNull();

    await click();

    expect(container.querySelector("[data-panel]")).not.toBeNull();
    expect(window.location.pathname + window.location.search).toBe(
      "/products?q=apples&product=p1",
    );
    expect(container.querySelector("[data-href]")?.textContent).toBe(
      "/products?q=apples&product=p1",
    );
    expect(
      container.querySelector("a")?.getAttribute("data-panel-active"),
    ).toBe("true");
  });

  it("starts from the URL, so a reload or a shared link opens the panel", async () => {
    await render("/products?q=apples&product=p1");

    expect(container.querySelector("[data-panel]")).not.toBeNull();
    expect(
      container.querySelector("a")?.getAttribute("data-panel-active"),
    ).toBe("true");
  });

  it("closes back to the list's own URL, keeping the filters", async () => {
    await render("/products?q=apples&product=p1");
    expect(container.querySelector("[data-panel]")).not.toBeNull();

    const close = container.querySelector("button");
    if (!close) throw new Error("No close control rendered");
    await act(async () => {
      close.click();
    });

    expect(container.querySelector("[data-panel]")).toBeNull();
    expect(container.querySelector("[data-href]")?.textContent).toBe(
      "/products?q=apples",
    );
    expect(window.location.pathname + window.location.search).toBe(
      "/products?q=apples",
    );
  });
});
