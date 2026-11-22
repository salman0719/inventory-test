"use client";

import { useEffect, useState } from "react";
import { usePanels } from "@/components/panel-host";
import { PanelLink } from "@/components/panel-link";
import type { InventoryPanelPayload } from "@/lib/inventory-panel";
import { DetailPanel } from "../detail-panel";
import { InventoryPanel } from "./inventory-panel";

/**
 * The stock panel's column: it reads the open product from the provider's URL state
 * and fetches its own data, so a row click never re-renders the list behind it.
 */

type State =
  | { status: "loading" }
  | { status: "ready"; data: InventoryPanelPayload }
  | { status: "error"; message: string };

const MESSAGE_BUTTON =
  "mt-3 inline-flex min-h-[36px] items-center rounded border border-line px-2.5 text-[12px] font-medium hover:border-accent hover:text-accent";

export function InventoryPanelColumn() {
  const { href, closeHref } = usePanels();
  const params = new URL(href, "http://panel.local").searchParams;
  const productId = params.get("product") ?? "";
  const saved = params.get("saved") === "true";
  const [attempt, setAttempt] = useState(0);

  return (
    <DetailPanel closeHref={closeHref} label="stock details">
      <PanelBody
        key={`${productId}:${attempt}`}
        productId={productId}
        saved={saved}
        closeHref={closeHref}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    </DetailPanel>
  );
}

function PanelBody({
  productId,
  saved,
  closeHref,
  onRetry,
}: {
  productId: string;
  saved: boolean;
  closeHref: string;
  onRetry: () => void;
}) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({
      mode: "detail",
      product: productId,
      saved: String(saved),
    });

    fetch(`/api/inventory/panel?${query.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("The panel could not be loaded.");
        return (await response.json()) as InventoryPanelPayload;
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
  }, [productId, saved]);

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

  if (state.data.item === null) {
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
    <InventoryPanel
      item={state.data.item}
      movements={state.data.movements}
      currency={state.data.currency}
      saved={state.data.saved}
      closeHref={closeHref}
      canViewValues={state.data.canViewValues}
    />
  );
}

/** The stock panel's shape: title, position, figures, then the ledger. */
function PanelSkeleton() {
  return (
    <aside aria-busy="true" className="rounded border border-line bg-surface">
      <span role="status" className="sr-only">
        Loading stock details
      </span>
      <div className="flex animate-pulse items-center gap-2 border-b border-line px-3 py-2 motion-reduce:animate-none">
        <div className="flex flex-1 flex-col gap-1.5">
          <span className="h-3.5 w-28 rounded bg-line" />
          <span className="h-2.5 w-16 rounded bg-line/70" />
        </div>
        <span className="h-9 w-[68px] rounded bg-line/60" />
      </div>
      <div className="animate-pulse px-3 pb-3 pt-3 motion-reduce:animate-none">
        <span className="block h-6 w-24 rounded bg-line" />
      </div>
      <div className="grid animate-pulse grid-cols-2 gap-x-3 gap-y-2 px-3 pb-3 motion-reduce:animate-none">
        {Array.from({ length: 4 }, (_, index) => (
          <span key={index} className="block h-8 rounded bg-line/70" />
        ))}
      </div>
    </aside>
  );
}
