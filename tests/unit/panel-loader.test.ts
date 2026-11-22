// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Every panel column now shares one fetch body, so this is the test that covers all
 * four: the frame comes first, the payload replaces it, and a failed request offers a
 * retry that does not touch the list behind the panel.
 */

vi.mock("next/link", () => ({
  default: (props: { href: string; children?: unknown; className?: string }) =>
    createElement(
      "a",
      { href: props.href, className: props.className },
      props.children as never,
    ),
}));

const { PanelLoader } = await import("@/components/panel-loader");

type Payload = { name: string };

const URL = "/api/products/panel?mode=detail&product=p1";

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
  vi.unstubAllGlobals();
});

function response(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

function loader() {
  // Built as a value so `children` is a render prop, not a JSX child.
  const props = {
    url: URL,
    label: "Loading product details",
    closeHref: "/products",
    children: (data: Payload) => createElement("p", null, data.name),
  };
  return createElement(PanelLoader<Payload>, props);
}

describe("the shared panel loader", () => {
  it("reserves the panel's frame, then renders the payload", async () => {
    let resolveFetch!: (value: Response) => void;
    const fetchMock = vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(loader());
    });

    expect(fetchMock).toHaveBeenCalledWith(
      URL,
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(
      container.querySelector('[aria-label="Loading product details"]'),
    ).not.toBeNull();
    expect(container.textContent).not.toContain("Tomatoes");

    await act(async () => {
      resolveFetch(response({ name: "Tomatoes" }));
    });

    expect(container.textContent).toContain("Tomatoes");
    expect(container.querySelector("[aria-busy]")).toBeNull();
  });

  it("offers a retry that fetches again without leaving the panel", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({}, false))
      .mockResolvedValueOnce(response({ name: "Cocoa" }));
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(loader());
    });

    expect(container.textContent).toContain("The panel could not be loaded.");

    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Try again",
    );
    if (!retry) throw new Error("No retry control rendered");

    await act(async () => {
      retry.click();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Cocoa");
  });
});
