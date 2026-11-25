"use client";

import { useActionState } from "react";
import {
  closeShortOrder,
  type OrderActionState,
} from "@/app/(app)/purchase-orders/actions";

/**
 * Writes off what never arrived. The delivered quantities stay on the order; only
 * the status and this reason change, so the shortfall has an explanation later.
 */
export function CloseShortForm({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState<
    OrderActionState,
    FormData
  >(closeShortOrder, {});

  return (
    <form
      action={formAction}
      className="flex flex-col gap-1.5"
      onSubmit={(event) => {
        if (
          !window.confirm(
            "Close this order short? The outstanding quantity will not be received, and this cannot be undone.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={orderId} />
      <p className="text-[11px] text-ink-muted">
        Use this when the rest is not coming. The order closes as received.
      </p>
      <input
        name="reason"
        maxLength={500}
        required
        placeholder="Why is the rest not coming?"
        aria-label="Why the order is closing short"
        className="h-9 rounded border border-line bg-surface px-2 text-[12px]"
      />
      {state.error ? (
        <p role="alert" className="text-[12px] text-danger">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-[36px] items-center justify-center rounded border border-line bg-surface px-2.5 text-[12px] font-medium hover:border-danger hover:text-danger disabled:opacity-60"
      >
        {pending ? "Closing…" : "Close balance short"}
      </button>
    </form>
  );
}
