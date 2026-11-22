"use client";

import { useEffect, useState } from "react";
import { hrefWithPanel, usePanels } from "@/components/panel-host";
import { PanelLink } from "@/components/panel-link";
import type { OrderPanelPayload } from "@/lib/order-panel";
import { DetailPanel } from "../detail-panel";
import { PurchaseOrderForm } from "./purchase-order-form";
import { PurchaseOrderPanel } from "./purchase-order-panel";

/**
 * The order panel's column: draft editor or received/ordered detail, fetched on its
 * own so a row click never re-renders the list.
 */

type State =
  | { status: "loading" }
  | { status: "ready"; data: OrderPanelPayload }
  | { status: "error"; message: string };

const BUTTON =
  "inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-2.5 text-[12px] font-medium hover:border-accent hover:text-accent";
const MESSAGE_BUTTON =
  "mt-3 inline-flex min-h-[36px] items-center rounded border border-line px-2.5 text-[12px] font-medium hover:border-accent hover:text-accent";

export function OrderPanelColumn() {
  const { href, closeHref } = usePanels();
  const params = new URL(href, "http://panel.local").searchParams;
  const creating = params.get("new") === "true";
  const editing = params.get("edit") === "true";
  const orderId = params.get("order") ?? "";
  const mode = creating ? "create" : editing ? "edit" : "detail";
  const saved = params.get("saved") ?? "";
  const [attempt, setAttempt] = useState(0);

  return (
    <DetailPanel closeHref={closeHref} label="order details">
      <PanelBody
        key={`${mode}:${orderId}:${attempt}`}
        mode={mode}
        orderId={orderId}
        saved={saved}
        closeHref={closeHref}
        editHref={
          orderId
            ? hrefWithPanel(href, {
                order: orderId,
                edit: "true",
                saved: null,
              })
            : undefined
        }
        onRetry={() => setAttempt((value) => value + 1)}
      />
    </DetailPanel>
  );
}

function PanelBody({
  mode,
  orderId,
  saved,
  closeHref,
  editHref,
  onRetry,
}: {
  mode: "create" | "edit" | "detail";
  orderId: string;
  saved: string;
  closeHref: string;
  editHref?: string;
  onRetry: () => void;
}) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ mode, order: orderId, saved });

    fetch(`/api/purchase-orders/panel?${query.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("The panel could not be loaded.");
        return (await response.json()) as OrderPanelPayload;
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
  }, [mode, orderId, saved]);

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

  const { data } = state;

  if (data.mode === "create" || data.mode === "edit") {
    if (data.options === null || data.defaults === null)
      return <PanelSkeleton />;
    return (
      <div className="rounded border border-line bg-surface">
        <header className="flex items-center gap-2 border-b border-line px-3 py-2">
          <h2 className="min-w-0 truncate text-[13px] font-semibold">
            {data.mode === "edit" && data.detail
              ? `Edit ${data.detail.order.orderNumber}`
              : "New purchase order"}
          </h2>
          <PanelLink
            href={closeHref}
            aria-label="Close order panel"
            className={`${BUTTON} ml-auto shrink-0`}
          >
            Close
          </PanelLink>
        </header>
        <div className="px-3 py-3">
          <PurchaseOrderForm
            mode={data.mode}
            suppliers={data.options.suppliers}
            products={data.options.products}
            defaults={data.defaults}
            cancelHref={closeHref}
          />
        </div>
      </div>
    );
  }

  if (data.detail === null) {
    return (
      <div className="rounded border border-line bg-surface px-3 py-6 text-center">
        <p className="text-[13px] font-medium">
          That order is not in this business
        </p>
        <p className="mt-1 text-[12px] text-ink-muted">
          Open an order from the list, or close this panel.
        </p>
        <PanelLink href={closeHref} className={MESSAGE_BUTTON}>
          Close panel
        </PanelLink>
      </div>
    );
  }

  return (
    <PurchaseOrderPanel
      detail={data.detail}
      currency={data.currency}
      saved={data.saved}
      closeHref={closeHref}
      editHref={editHref ?? closeHref}
      idempotencyKey={data.idempotencyKey}
      canViewValues={data.canViewValues}
    />
  );
}

/** The order panel's shape: reference and supplier, then the figures. */
function PanelSkeleton() {
  return (
    <aside aria-busy="true" className="rounded border border-line bg-surface">
      <span role="status" className="sr-only">
        Loading order details
      </span>
      <div className="flex animate-pulse items-center gap-2 border-b border-line px-3 py-2 motion-reduce:animate-none">
        <div className="flex flex-1 flex-col gap-1.5">
          <span className="h-3.5 w-20 rounded bg-line" />
          <span className="h-2.5 w-28 rounded bg-line/70" />
        </div>
        <span className="h-9 w-[68px] rounded bg-line/60" />
      </div>
      <div className="grid animate-pulse grid-cols-2 gap-x-3 gap-y-2 px-3 py-3 motion-reduce:animate-none">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex flex-col gap-1.5">
            <span className="h-2 w-12 rounded bg-line/70" />
            <span className="h-3 w-20 rounded bg-line" />
          </div>
        ))}
      </div>
    </aside>
  );
}
