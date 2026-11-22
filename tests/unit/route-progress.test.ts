// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * The top bar exists to make a click visible before the destination route can
 * paint, so it has to disappear completely when nothing is in flight — a bar that
 * is always mounted reads as a permanent loading state.
 */

const { RouteProgress } = await import("@/components/route-progress");

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
});

async function render(active: boolean) {
  await act(async () => {
    root.render(createElement(RouteProgress, { active }));
  });
}

describe("the route progress bar", () => {
  it("renders nothing while no navigation is in flight", async () => {
    await render(false);
    expect(container.innerHTML).toBe("");
  });

  it("renders a decorative bar above the page while pending", async () => {
    await render(true);

    const bar = container.querySelector(".route-progress-bar");
    expect(bar).not.toBeNull();
    expect(bar?.parentElement?.getAttribute("aria-hidden")).toBe("true");
    expect(bar?.parentElement?.className).toContain("fixed");
  });
});
