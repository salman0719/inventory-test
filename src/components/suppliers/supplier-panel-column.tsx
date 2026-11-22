"use client";

import { useEffect, useState } from "react";
import { hrefWithPanel, usePanels } from "@/components/panel-host";
import { PanelLink } from "@/components/panel-link";
import type { SupplierPanelPayload } from "@/lib/supplier-panel";
import { DetailPanel } from "../detail-panel";
import { SupplierPanel } from "./supplier-panel";

/**
 * The supplier panel's column: it reads the open supplier from the provider's URL
 * state and fetches its own data, so a row click never re-renders the list.
 */

type State =
  | { status: "loading" }
  | { status: "ready"; data: SupplierPanelPayload }
  | { status: "error"; message: string };

const MESSAGE_BUTTON =
  "mt-3 inline-flex min-h-[36px] items-center rounded border border-line px-2.5 text-[12px] font-medium hover:border-accent hover:text-accent";

export function SupplierPanelColumn() {
  const { href, closeHref } = usePanels();
  const params = new URL(href, "http://panel.local").searchParams;
  const creating = params.get("new") === "true";
  const editing = params.get("edit") === "true";
  const supplierId = params.get("supplier") ?? "";
  const mode = creating ? "create" : editing ? "edit" : "detail";
  const saved = params.get("saved") === "true" && !editing;
  const [attempt, setAttempt] = useState(0);

  return (
    <DetailPanel closeHref={closeHref} label="supplier details">
      <PanelBody
        key={`${mode}:${supplierId}:${attempt}`}
        mode={mode}
        supplierId={supplierId}
        saved={saved}
        closeHref={closeHref}
        editHref={
          supplierId
            ? hrefWithPanel(href, { supplier: supplierId, edit: "true" })
            : undefined
        }
        onRetry={() => setAttempt((value) => value + 1)}
      />
    </DetailPanel>
  );
}

function PanelBody({
  mode,
  supplierId,
  saved,
  closeHref,
  editHref,
  onRetry,
}: {
  mode: "create" | "edit" | "detail";
  supplierId: string;
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
      supplier: supplierId,
      saved: String(saved),
    });

    fetch(`/api/suppliers/panel?${query.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("The panel could not be loaded.");
        return (await response.json()) as SupplierPanelPayload;
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
  }, [mode, supplierId, saved]);

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

  if (state.data.supplier === null && state.data.mode !== "create") {
    return (
      <div className="rounded border border-line bg-surface px-3 py-6 text-center">
        <p className="text-[13px] font-medium">
          That supplier is not in this business
        </p>
        <p className="mt-1 text-[12px] text-ink-muted">
          Open a supplier from the list, or close this panel.
        </p>
        <PanelLink href={closeHref} className={MESSAGE_BUTTON}>
          Close panel
        </PanelLink>
      </div>
    );
  }

  return (
    <SupplierPanel
      mode={state.data.mode}
      supplier={state.data.supplier}
      products={state.data.products}
      saved={state.data.saved}
      closeHref={closeHref}
      editHref={editHref}
    />
  );
}

/** The supplier panel's shape: title, contact rows, then the catalogue list. */
function PanelSkeleton() {
  return (
    <aside aria-busy="true" className="rounded border border-line bg-surface">
      <span role="status" className="sr-only">
        Loading supplier details
      </span>
      <div className="flex animate-pulse items-center gap-2 border-b border-line px-3 py-2 motion-reduce:animate-none">
        <span className="h-3.5 flex-1 rounded bg-line" />
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
