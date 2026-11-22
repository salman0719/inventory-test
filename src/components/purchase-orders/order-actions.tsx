"use client";

import { useActionState } from "react";
import {
  cancelOrder,
  markOrdered,
  type OrderActionState,
} from "@/app/(app)/purchase-orders/actions";
import type { OrderStatus } from "@/lib/purchase-order-input";

/**
 * The two order transitions a person makes by hand. Receiving is the third, and it
 * has its own form because it takes quantities. Cancelling asks first: the state
 * change cannot be undone.
 */
export function OrderActions({
  orderId,
  status,
}: {
  orderId: string;
  status: OrderStatus;
}) {
  const [markState, markAction, marking] = useActionState<
    OrderActionState,
    FormData
  >(markOrdered, {});
  const [cancelState, cancelAction, cancelling] = useActionState<
    OrderActionState,
    FormData
  >(cancelOrder, {});

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
      {status === "draft" ? (
        <form action={markAction}>
          <input type="hidden" name="id" value={orderId} />
          <button
            type="submit"
            disabled={marking}
            className="inline-flex min-h-[36px] items-center rounded bg-accent px-3 text-[12px] font-semibold text-on-accent disabled:opacity-60"
          >
            {marking ? "Marking…" : "Mark as ordered"}
          </button>
        </form>
      ) : null}

      <form
        action={cancelAction}
        onSubmit={(event) => {
          if (
            !window.confirm(
              "Cancel this order? It can no longer be received, and any outstanding quantities stay unordered.",
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={orderId} />
        <button
          type="submit"
          disabled={cancelling}
          className="inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-2.5 text-[12px] font-medium hover:border-danger hover:text-danger disabled:opacity-60"
        >
          {cancelling ? "Cancelling…" : "Cancel order"}
        </button>
      </form>

      {markState.error || cancelState.error ? (
        <p role="alert" className="w-full text-[12px] text-danger">
          {markState.error ?? cancelState.error}
        </p>
      ) : null}
    </div>
  );
}
