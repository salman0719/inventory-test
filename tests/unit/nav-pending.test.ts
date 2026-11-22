// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The rail has to show that a click was received before the next route commits,
 * because a dynamic route is only shell-prefetched. The dot is driven entirely by
 * `useLinkStatus`, so it must render nothing while idle and something while
 * pending — otherwise the rail either flickers permanently or stays silent.
 */

const mocks = vi.hoisted(() => ({ pending: false }));

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: mocks.pending }),
}));

const { NavPending } = await import("@/components/nav-pending");

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

function render() {
  return act(async () => {
    root.render(createElement(NavPending));
  });
}

describe("the nav pending indicator", () => {
  it("renders nothing while no navigation is in flight", async () => {
    await render();
    expect(container.innerHTML).toBe("");
  });

  it("renders the dot once the link is pending", async () => {
    mocks.pending = true;
    await render();

    const dot = container.querySelector("span");
    expect(dot).not.toBeNull();
    expect(dot?.getAttribute("aria-hidden")).toBe("true");
  });
});
