// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Any link can carry the click acknowledgement now, so the wrapper has to stay a
 * real anchor with its href and the caller's classes, and it must only add the
 * pending signal while the navigation it started is in flight.
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

const { PendingLink } = await import("@/components/pending-link");

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

async function render(cue?: "bar" | "dot" | "bar-and-dot") {
  await act(async () => {
    root.render(
      createElement(
        PendingLink,
        { href: "/inventory?sort=low", className: "text-accent", cue },
        "Open inventory",
      ),
    );
  });
}

describe("the pending link", () => {
  it("stays a real anchor with its href and the caller's class", async () => {
    await render();

    const anchor = container.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe("/inventory?sort=low");
    expect(anchor?.className).toContain("text-accent");
    expect(anchor?.textContent).toBe("Open inventory");
    expect(container.querySelector(".route-progress-bar")).toBeNull();
  });

  it("paints the route bar while its navigation is pending", async () => {
    mocks.pending = true;
    await render();

    expect(container.querySelector(".route-progress-bar")).not.toBeNull();
    // The inline cue is the bar; the corner dot belongs to positioned tiles.
    expect(container.querySelector("[data-link-pending]")).toBeNull();
  });

  it("adds the corner dot when the cue asks for it", async () => {
    mocks.pending = true;
    await render("bar-and-dot");

    const dot = container.querySelector("[data-link-pending]");
    expect(dot?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".route-progress-bar")).not.toBeNull();
  });

  it("drops the signal again when the navigation settles", async () => {
    mocks.pending = true;
    await render();
    expect(container.querySelector(".route-progress-bar")).not.toBeNull();

    mocks.pending = false;
    await render();

    expect(container.querySelector(".route-progress-bar")).toBeNull();
    expect(container.innerHTML).toContain("Open inventory");
  });
});
