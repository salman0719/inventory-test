"use client";

import { useActionState, useState } from "react";
import {
  recordMovement,
  type MovementFormState,
} from "@/app/(app)/inventory/actions";
import {
  MOVEMENT_LABELS,
  MOVEMENT_TYPES,
  type MovementDirection,
  type MovementType,
} from "@/lib/stock-input";

const INPUT =
  "h-9 w-full rounded border border-line bg-surface px-2 text-[13px]";
const LABEL = "text-[10px] uppercase tracking-[0.07em] text-ink-muted";

/**
 * The only control that changes stock. It offers stock in, stock out and an
 * adjustment with a required reason; it never asks for a final on-hand figure,
 * because the ledger — not a stored quantity — is what the screens read.
 */
export function MovementForm({
  productId,
  unit,
}: {
  productId: string;
  unit: string;
}) {
  const [state, formAction, pending] = useActionState<
    MovementFormState,
    FormData
  >(recordMovement, {});
  const [movementType, setMovementType] = useState<MovementType>("stock_in");
  // Controlled, because React resets an uncontrolled form after every action: a
  // rejected quantity would otherwise vanish and have to be retyped.
  const [quantity, setQuantity] = useState("");
  const [direction, setDirection] = useState<MovementDirection>("in");
  const [reason, setReason] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-2.5">
      <input type="hidden" name="productId" value={productId} />

      <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Movement</span>
          <select
            name="movementType"
            value={movementType}
            onChange={(event) =>
              setMovementType(event.target.value as MovementType)
            }
            className={INPUT}
          >
            {MOVEMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {MOVEMENT_LABELS[type]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className={LABEL}>Quantity ({unit})</span>
          <input
            name="quantity"
            required
            inputMode="decimal"
            placeholder="0"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className={`${INPUT} font-mono`}
          />
        </label>
      </div>

      {movementType === "adjustment" ? (
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Direction</span>
          <select
            name="direction"
            value={direction}
            onChange={(event) =>
              setDirection(event.target.value as MovementDirection)
            }
            className={INPUT}
          >
            <option value="in">Add to stock</option>
            <option value="out">Remove from stock</option>
          </select>
        </label>
      ) : null}

      <label className="flex flex-col gap-1">
        <span className={LABEL}>
          Reason{movementType === "adjustment" ? " (required)" : " (optional)"}
        </span>
        <input
          name="reason"
          maxLength={200}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={
            movementType === "adjustment"
              ? "Stock-take correction, damage, sample…"
              : "Delivery note, supplier, note…"
          }
          className={INPUT}
        />
      </label>

      {state.error ? (
        <p
          role="alert"
          className="rounded border border-line bg-danger-soft px-2.5 py-2 text-[12px] text-danger"
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-0.5 inline-flex min-h-[36px] items-center justify-center rounded bg-accent px-3 text-[12px] font-semibold text-on-accent disabled:opacity-60"
      >
        {pending ? "Recording…" : "Record movement"}
      </button>
    </form>
  );
}
