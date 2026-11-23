"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PanelLink } from "./panel-link";

/**
 * The one fetch body behind every panel column.
 *
 * Each panel asks its own endpoint for exactly what it shows, and all four screens
 * had grown the same body: request on mount, a skeleton in the panel's shape, an
 * error that offers a retry without touching the list, and a `Pending` state keyed on
 * the request so a different row starts from its skeleton rather than the previous
 * row's data. That body lives here; a column only says what to render for its payload.
 *
 * The skeleton is `aria-busy` rather than a live region: opening a panel is announced
 * once by the results grid (`PanelGrid label=…`), and a second "Loading…" would talk
 * over it.
 */

type State<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; message: string };

const MESSAGE_BUTTON =
  "mt-3 inline-flex min-h-[36px] items-center rounded border border-line px-2.5 text-[12px] font-medium hover:border-accent hover:text-accent";

export function PanelLoader<T>({
  url,
  label,
  closeHref,
  fields = 4,
  lead = false,
  children,
}: {
  /** The endpoint and query for this panel, e.g. `/api/products/panel?mode=…`. */
  url: string;
  /** Names the panel while it loads, for the skeleton's accessible name. */
  label: string;
  closeHref: string;
  /** How many figure cells the skeleton reserves. */
  fields?: number;
  /** Adds one wide bar, for a panel that leads with a single number. */
  lead?: boolean;
  children: (data: T) => ReactNode;
}) {
  const [state, setState] = useState<State<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("The panel could not be loaded.");
        return (await response.json()) as T;
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
  }, [url, attempt]);

  if (state.status === "loading") {
    return <PanelSkeleton label={label} fields={fields} lead={lead} />;
  }

  if (state.status === "error") {
    return (
      <div className="rounded border border-line bg-surface px-3 py-6 text-center">
        <p className="text-[13px] font-medium">{state.message}</p>
        <p className="mt-1 text-[12px] text-ink-muted">
          The list is unchanged. Try again, or close the panel.
        </p>
        <button
          type="button"
          onClick={() => {
            setState({ status: "loading" });
            setAttempt((value) => value + 1);
          }}
          className={MESSAGE_BUTTON}
        >
          Try again
        </button>
        <PanelLink href={closeHref} className={`${MESSAGE_BUTTON} ml-2`}>
          Close panel
        </PanelLink>
      </div>
    );
  }

  return <>{children(state.data)}</>;
}

/** The one "this row is not in this business" box, in the panel's own frame. */
export function PanelNotice({
  title,
  body,
  closeHref,
}: {
  title: string;
  body: string;
  closeHref: string;
}) {
  return (
    <div className="rounded border border-line bg-surface px-3 py-6 text-center">
      <p className="text-[13px] font-medium">{title}</p>
      <p className="mt-1 text-[12px] text-ink-muted">{body}</p>
      <PanelLink href={closeHref} className={MESSAGE_BUTTON}>
        Close panel
      </PanelLink>
    </div>
  );
}

/** Reserves the panel's frame, in the shape every panel shares: header, figures. */
function PanelSkeleton({
  label,
  fields,
  lead,
}: {
  label: string;
  fields: number;
  lead: boolean;
}) {
  return (
    <aside
      aria-busy="true"
      aria-label={label}
      className="rounded border border-line bg-surface max-[899px]:rounded-none max-[899px]:border-0"
    >
      <div className="flex animate-pulse items-center gap-2 border-b border-line px-3 py-2 motion-reduce:animate-none">
        <div className="flex flex-1 flex-col gap-1.5">
          <span className="h-3.5 w-28 rounded bg-line" />
          <span className="h-2.5 w-16 rounded bg-line/70" />
        </div>
        <span className="h-9 w-[68px] rounded bg-line/60" />
      </div>
      {lead ? (
        <div className="animate-pulse px-3 pt-3 motion-reduce:animate-none">
          <span className="block h-6 w-24 rounded bg-line" />
        </div>
      ) : null}
      <div className="grid animate-pulse grid-cols-2 gap-x-3 gap-y-2 px-3 py-3 motion-reduce:animate-none">
        {Array.from({ length: fields }, (_, index) => (
          <div key={index} className="flex flex-col gap-1.5">
            <span className="h-2 w-12 rounded bg-line/70" />
            <span className="h-3 w-20 rounded bg-line" />
          </div>
        ))}
      </div>
    </aside>
  );
}
