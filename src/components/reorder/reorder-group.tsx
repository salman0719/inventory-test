"use client";

import { useActionState, useState } from "react";
import {
  createReorderDraft,
  type ReorderFormState,
} from "@/app/(app)/reorder/actions";
import { formatQuantity } from "@/lib/product-input";
import { quantityField } from "@/lib/purchase-order-input";
import type { ReorderSupplierGroup } from "@/lib/reorder";

const TH =
  "px-2.5 py-1.5 text-left text-[10px] font-medium uppercase tracking-[0.07em] text-ink-muted";
const TD = "px-2.5 py-1.5 align-middle";
const INPUT =
  "h-8 w-20 rounded border border-line bg-surface px-1.5 text-right font-mono text-[12px] disabled:bg-panel disabled:text-ink-faint";

function leadTimeLabel(days: number | null): string {
  if (days === null) return "No lead time recorded";
  if (days === 0) return "Usually same day";
  return `Usually ${days} calendar ${days === 1 ? "day" : "days"}`;
}

/**
 * One supplier's suggestions, with the quantity editable before selection.
 *
 * Draft quantities are not on-order, so a product already on the draft would keep
 * appearing here; it is marked and cannot be selected again. When the supplier's
 * open order has been sent, the whole group is read-only: the server refuses that
 * case too, but the screen should not invite an action it knows will fail.
 */
export function ReorderGroup({
  group,
  canOrder,
}: {
  group: ReorderSupplierGroup;
  canOrder: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    ReorderFormState,
    FormData
  >(createReorderDraft, {});
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      group.rows.map((row) => [row.productId, quantityField(row.suggested)]),
    ),
  );

  const blocked =
    group.openOrder !== null && group.openOrder.status !== "draft";
  const interactive = canOrder && !blocked;
  const selectable = group.rows.filter((row) => !row.onDraft);
  const allSelected =
    selectable.length > 0 &&
    selectable.every((row) => selected.has(row.productId));
  const actionLabel =
    group.openOrder?.status === "draft"
      ? `Add to ${group.openOrder.orderNumber}`
      : "Create draft order";

  function toggle(productId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function toggleAll() {
    setSelected(
      allSelected ? new Set() : new Set(selectable.map((row) => row.productId)),
    );
  }

  return (
    <section className="overflow-clip rounded border border-line bg-surface">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-panel px-3 py-2">
        <h2 className="text-[13px] font-semibold">{group.supplierName}</h2>
        <span className="text-[11px] text-ink-faint">
          {leadTimeLabel(group.leadTimeDays)}
        </span>
        <span
          className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${
            group.openOrder === null
              ? "border border-line bg-surface text-ink-muted"
              : group.openOrder.status === "draft"
                ? "bg-accent-soft text-accent"
                : "bg-warning-soft text-warning"
          }`}
        >
          {group.openOrder === null
            ? "No open order"
            : group.openOrder.status === "draft"
              ? `Draft ${group.openOrder.orderNumber}`
              : `${group.openOrder.orderNumber} with supplier`}
        </span>
      </header>

      <form action={formAction}>
        <input type="hidden" name="supplierId" value={group.supplierId} />

        {interactive ? (
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2 min-[900px]:hidden">
            <label className="inline-flex min-h-[44px] items-center gap-2 text-[11.5px] text-ink-muted">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                disabled={selectable.length === 0}
                aria-label={`Select every product to reorder from ${group.supplierName}`}
                className="h-5 w-5 accent-accent disabled:opacity-40"
              />
              Select all
            </label>
            <span className="text-[11px] text-ink-faint">
              {selected.size} selected
            </span>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 p-2 min-[900px]:hidden">
          {group.rows.map((row) => (
            <div
              key={row.productId}
              className="flex gap-3 rounded-lg border border-line bg-surface p-3"
            >
              {interactive ? (
                <input
                  type="checkbox"
                  checked={selected.has(row.productId)}
                  onChange={() => toggle(row.productId)}
                  disabled={row.onDraft}
                  aria-label={`Select ${row.name}`}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-accent disabled:opacity-40"
                />
              ) : null}
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="min-w-0">
                  <div className="text-[13.5px] leading-tight font-semibold">
                    {row.name}
                  </div>
                  <div className="mt-0.5 font-mono text-[10.5px] text-ink-faint">
                    {row.sku}
                    {row.onDraft ? (
                      <span className="ml-2 text-warning">
                        On {group.openOrder?.orderNumber}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-muted">
                  <span>
                    On hand{" "}
                    <b className="font-mono text-[12.5px] font-medium text-ink">
                      {formatQuantity(row.onHand)} {row.unitOfMeasure}
                    </b>
                  </span>
                  <span>
                    On order{" "}
                    <b className="font-mono text-[12.5px] font-medium text-ink">
                      {formatQuantity(row.onOrder)}
                    </b>
                  </span>
                  <span>
                    Target{" "}
                    <b className="font-mono text-[12.5px] font-medium text-ink">
                      {formatQuantity(row.target)}
                    </b>
                  </span>
                </div>
                <label className="flex items-center justify-between gap-2 text-[11.5px] text-ink-muted">
                  To order
                  {interactive ? (
                    <input
                      value={
                        quantities[row.productId] ??
                        quantityField(row.suggested)
                      }
                      onChange={(event) =>
                        setQuantities((current) => ({
                          ...current,
                          [row.productId]: event.target.value,
                        }))
                      }
                      inputMode="decimal"
                      disabled={row.onDraft}
                      aria-label={`Quantity to order for ${row.name}`}
                      className="h-11 w-24 rounded border border-line bg-surface px-2 text-right font-mono text-[13px] disabled:bg-panel disabled:text-ink-faint"
                    />
                  ) : (
                    <span className="font-mono text-[12.5px] text-ink">
                      {formatQuantity(row.suggested)}
                    </span>
                  )}
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden overflow-x-auto min-[900px]:block">
          <table className="w-full min-w-[660px] border-collapse text-[12.5px]">
            <caption className="sr-only">
              Reorder suggestions for {group.supplierName}, with on hand, on
              order, target stock and the quantity to order
            </caption>
            <thead className="border-b border-line">
              <tr>
                {interactive ? (
                  <th scope="col" className={`${TH} w-8`}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      disabled={selectable.length === 0}
                      aria-label={`Select every product to reorder from ${group.supplierName}`}
                      className="h-3.5 w-3.5 accent-accent disabled:opacity-40"
                    />
                  </th>
                ) : null}
                <th scope="col" className={TH}>
                  Product
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  On hand
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  On order
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Target
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  To order
                </th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row) => {
                return (
                  <tr
                    key={row.productId}
                    className="border-b border-line last:border-b-0"
                  >
                    {interactive ? (
                      <td className={TD}>
                        <input
                          type="checkbox"
                          name="product"
                          value={row.productId}
                          checked={selected.has(row.productId)}
                          onChange={() => toggle(row.productId)}
                          disabled={row.onDraft}
                          aria-label={`Select ${row.name}`}
                          className="h-3.5 w-3.5 accent-accent disabled:opacity-40"
                        />
                      </td>
                    ) : null}
                    <td className={TD}>
                      <span className="block">{row.name}</span>
                      <span className="block font-mono text-[10.5px] text-ink-faint">
                        {row.sku}
                        {row.onDraft ? (
                          <span className="ml-2 text-warning">
                            On {group.openOrder?.orderNumber}
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className={`${TD} text-right font-mono`}>
                      {formatQuantity(row.onHand)}
                      <span className="ml-1 text-[10.5px] text-ink-faint">
                        {row.unitOfMeasure}
                      </span>
                    </td>
                    <td className={`${TD} text-right font-mono text-ink-muted`}>
                      {formatQuantity(row.onOrder)}
                    </td>
                    <td className={`${TD} text-right font-mono`}>
                      {formatQuantity(row.target)}
                      <span className="block text-[10px] text-ink-faint">
                        {row.targetSource === "set" ? "set" : "reorder × 2"}
                      </span>
                    </td>
                    <td className={`${TD} text-right`}>
                      {interactive ? (
                        <input
                          name={`quantity:${row.productId}`}
                          value={
                            quantities[row.productId] ??
                            quantityField(row.suggested)
                          }
                          onChange={(event) =>
                            setQuantities((current) => ({
                              ...current,
                              [row.productId]: event.target.value,
                            }))
                          }
                          inputMode="decimal"
                          disabled={row.onDraft}
                          aria-label={`Quantity to order for ${row.name}`}
                          className={INPUT}
                        />
                      ) : (
                        <span className="font-mono">
                          {formatQuantity(row.suggested)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {state.error ? (
          <p
            role="alert"
            className="border-t border-line bg-danger-soft px-3 py-2 text-[12px] text-danger"
          >
            {state.error}
          </p>
        ) : null}

        {blocked ? (
          <p className="border-t border-line px-3 py-2 text-[12px] text-warning">
            {group.openOrder?.orderNumber} is already with {group.supplierName}.
            Receive or close it before ordering more.
          </p>
        ) : canOrder ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
            <p className="text-[11.5px] text-ink-muted">
              {selected.size} selected
              {selectable.length === 0
                ? " · every suggestion here is already on the draft"
                : ""}
            </p>
            <button
              type="submit"
              disabled={pending || selected.size === 0}
              className="ml-auto inline-flex min-h-[36px] items-center rounded bg-accent px-3 text-[12px] font-semibold text-on-accent disabled:opacity-60"
            >
              {pending ? "Saving…" : actionLabel}
            </button>
          </div>
        ) : (
          <p className="border-t border-line px-3 py-2 text-[11.5px] text-ink-muted">
            Creating orders is limited to owners and staff. You can read the
            suggestions and their figures.
          </p>
        )}
      </form>
    </section>
  );
}
