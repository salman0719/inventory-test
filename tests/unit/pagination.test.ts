// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Paging must stay URL-driven: the controls are links, so a reload of
 * `/products?page=3` renders page three on the server. The only client state is
 * the pending label, which appears while the link's navigation is in flight and
 * has to disappear when it is not.
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

const { Pagination } = await import("@/components/pagination");

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

async function render(props: {
  page: number;
  pageCount: number;
  previousHref?: string;
  nextHref?: string;
}) {
  await act(async () => {
    root.render(createElement(Pagination, props));
  });
}

function hrefs() {
  return Array.from(container.querySelectorAll("a")).map((link) =>
    link.getAttribute("href"),
  );
}

describe("the list pager", () => {
  it("renders nothing for a single page", async () => {
    await render({ page: 1, pageCount: 1 });
    expect(container.innerHTML).toBe("");
  });

  it("links to the neighbouring pages without dropping the route", async () => {
    await render({
      page: 2,
      pageCount: 3,
      previousHref: "/products?page=1",
      nextHref: "/products?page=3",
    });

    expect(hrefs()).toEqual(["/products?page=1", "/products?page=3"]);
    expect(container.textContent).toContain("Page 2 of 3");
  });

  it("omits the control that would leave the range", async () => {
    await render({ page: 1, pageCount: 2, nextHref: "/inventory?page=2" });
    expect(hrefs()).toEqual(["/inventory?page=2"]);

    await act(async () => root.unmount());
    root = createRoot(container);
    await render({ page: 2, pageCount: 2, previousHref: "/inventory?page=1" });
    expect(hrefs()).toEqual(["/inventory?page=1"]);
  });

  it("names the page being loaded and shows the route bar while pending", async () => {
    mocks.pending = true;
    await render({
      page: 2,
      pageCount: 3,
      previousHref: "/products?page=1",
      nextHref: "/products?page=3",
    });

    expect(container.textContent).toContain("Loading page 3…");
    expect(container.querySelector(".route-progress-bar")).not.toBeNull();
  });
});
