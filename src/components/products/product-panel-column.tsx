"use client";

import { useEffect, useState } from "react";
import { hrefWithPanel, usePanels } from "@/components/panel-host";
import { PanelLink } from "@/components/panel-link";
import type { ProductPanelPayload } from "@/lib/product-panel";
import { DetailPanel } from "../detail-panel";
import { ProductPanel } from "./product-panel";

/**
 * The panel's column. It reads the open product from the URL state the provider
 * holds and fetches the panel's own payload, so nothing here re-renders the list.
 *
 * This is the cost of taking the panel out of the page render: on a reload or a
 * shared link the panel arrives in two steps — a frame, then its data — instead of
 * being in the first HTML.
 */

type State =
  | { status: "loading" }
  | { status: "ready"; data: ProductPanelPayload }
  | { status: "error"; message: string };

const MESSAGE_BUTTON =
  "mt-3 inline-flex min-h-[36px] items-center rounded border border-line px-2.5 text-[12px] font-medium hover:border-accent hover:text-accent";

export function ProductPanelColumn() {
  const { href, closeHref } = usePanels();
  const params = new URL(href, "http://panel.local").searchParams;
  const mode = params.get("new") === "true" ? "create" : "detail";
  const editing = params.get("edit") === "true";
  const productId = params.get("product") ?? "";
  const saved = params.get("saved") === "true" && !editing;
  const [attempt, setAttempt] = useState(0);

  const panelMode = mode === "create" ? "create" : editing ? "edit" : "detail";

  return (
    <DetailPanel closeHref={closeHref} label="product details">
      {/* Keyed on the request, so a different product or mode starts from its
          skeleton instead of showing the previous panel's data. */}
      <PanelBody
        key={`${panelMode}:${productId}:${attempt}`}
        mode={panelMode}
        productId={productId}
        saved={saved}
        closeHref={closeHref}
        editHref={
          productId
            ? hrefWithPanel(href, { product: productId, edit: "true" })
            : undefined
        }
        onRetry={() => setAttempt((value) => value + 1)}
      />
    </DetailPanel>
  );
}

function PanelBody({
  mode,
  productId,
  saved,
  closeHref,
  editHref,
  onRetry,
}: {
  mode: ProductPanelPayload["mode"];
  productId: string;
  saved: boolean;
  closeHref: string;
  editHref?: string;
  onRetry: () => void;
}) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({
      mode,
      product: productId,
      saved: String(saved),
    });

    fetch(`/api/products/panel?${query.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("The panel could not be loaded.");
        return (await response.json()) as ProductPanelPayload;
      })
      .then((data) => setState({ status: "ready", data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "The panel could not be loaded.",
        });
      });

    return () => controller.abort();
  }, [mode, productId, saved]);

  if (state.status === "loading") return <PanelSkeleton />;

  if (state.status === "error") {
    return (
      <div className="rounded border border-line bg-surface px-3 py-6 text-center">
        <p className="text-[13px] font-medium">{state.message}</p>
        <p className="mt-1 text-[12px] text-ink-muted">
          The list is unchanged. Try again, or close the panel.
        </p>
        <button type="button" onClick={onRetry} className={MESSAGE_BUTTON}>
          Try again
        </button>
        <PanelLink href={closeHref} className={`${MESSAGE_BUTTON} ml-2`}>
          Close panel
        </PanelLink>
      </div>
    );
  }

  if (state.data.product === null && state.data.mode !== "create") {
    return (
      <div className="rounded border border-line bg-surface px-3 py-6 text-center">
        <p className="text-[13px] font-medium">
          That product is not in this business
        </p>
        <p className="mt-1 text-[12px] text-ink-muted">
          Open a product from the list, or close this panel.
        </p>
        <PanelLink href={closeHref} className={MESSAGE_BUTTON}>
          Close panel
        </PanelLink>
      </div>
    );
  }

  return (
    <ProductPanel
      mode={state.data.mode}
      product={state.data.product}
      categories={state.data.categories}
      suppliers={state.data.suppliers}
      currency={state.data.currency}
      saved={state.data.saved}
      closeHref={closeHref}
      editHref={editHref}
      canViewValues={state.data.canViewValues}
    />
  );
}

/** Reserves the panel's frame so opening it does not move the list. */
function PanelSkeleton() {
  return (
    <aside aria-busy="true" className="rounded border border-line bg-surface">
      <span role="status" className="sr-only">
        Loading product details
      </span>
      <div className="flex animate-pulse items-center gap-2 border-b border-line px-3 py-2 motion-reduce:animate-none">
        <div className="flex flex-1 flex-col gap-1.5">
          <span className="h-3.5 w-32 rounded bg-line" />
          <span className="h-2.5 w-16 rounded bg-line/70" />
        </div>
        <span className="h-9 w-[68px] rounded bg-line/60" />
      </div>
      <div className="grid animate-pulse grid-cols-2 gap-x-3 gap-y-2 px-3 py-3 motion-reduce:animate-none">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex flex-col gap-1.5">
            <span className="h-2 w-12 rounded bg-line/70" />
            <span className="h-3 w-20 rounded bg-line" />
          </div>
        ))}
      </div>
    </aside>
  );
}
