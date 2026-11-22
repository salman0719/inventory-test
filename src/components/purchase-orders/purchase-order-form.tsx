"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  saveOrder,
  type OrderFormState,
} from "@/app/(app)/purchase-orders/actions";

/**
 * The draft order editor: supplier, expected date, notes and the lines.
 *
 * The supplier comes first because a product belongs to one supplier; the product
 * select is filtered to that supplier's catalogue, and a product's cost pre-fills
 * the unit cost so the common case is one click per line.
 *
 * Quantities and costs stay strings: they are posted as numeric text and never
 * round through a float on the way to Postgres.
 */

type SupplierOption = { id: string; name: string };
type ProductOption = {
  id: string;
  name: string;
  sku: string;
  unitOfMeasure: string;
  costPrice: string;
  supplierId: string | null;
};

export type OrderFormDefaults = {
  id: string;
  supplierId: string;
  expectedDeliveryAt: string;
  notes: string;
  lines: { productId: string; quantity: string; unitCost: string }[];
};

type Row = {
  key: number;
  productId: string;
  quantity: string;
  unitCost: string;
};

let nextKey = 1;

function toRows(defaults: OrderFormDefaults): Row[] {
  if (defaults.lines.length === 0) {
    return [{ key: nextKey++, productId: "", quantity: "", unitCost: "" }];
  }
  return defaults.lines.map((line) => ({
    key: nextKey++,
    productId: line.productId,
    quantity: line.quantity,
    unitCost: line.unitCost,
  }));
}

const INPUT =
  "h-9 w-full rounded border border-line bg-surface px-2 text-[13px]";
const LABEL = "text-[10px] uppercase tracking-[0.07em] text-ink-muted";

export function PurchaseOrderForm({
  mode,
  suppliers,
  products,
  defaults,
  cancelHref,
}: {
  mode: "create" | "edit";
  suppliers: SupplierOption[];
  products: ProductOption[];
  defaults: OrderFormDefaults;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState<OrderFormState, FormData>(
    saveOrder,
    {},
  );
  const [supplierId, setSupplierId] = useState(defaults.supplierId);
  const [rows, setRows] = useState<Row[]>(() => toRows(defaults));

  const supplierProducts = products.filter(
    (product) => product.supplierId === supplierId,
  );

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function chooseSupplier(value: string) {
    if (value === supplierId) return;
    setSupplierId(value);
    // A line's product belongs to the old supplier; keeping it would submit a
    // product the new supplier does not sell.
    setRows([{ key: nextKey++, productId: "", quantity: "", unitCost: "" }]);
  }

  function chooseProduct(row: Row, productId: string) {
    const product = products.find((option) => option.id === productId);
    updateRow(row.key, {
      productId,
      unitCost:
        row.unitCost.trim() === "" ? (product?.costPrice ?? "") : row.unitCost,
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-2.5">
      <input type="hidden" name="id" value={defaults.id} />

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Supplier</span>
        <select
          name="supplierId"
          required
          value={supplierId}
          onChange={(event) => chooseSupplier(event.target.value)}
          className={INPUT}
        >
          <option value="">
            {suppliers.length === 0 ? "No suppliers yet" : "Choose a supplier"}
          </option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
        {mode === "edit" ? (
          <span className="text-[11px] text-ink-faint">
            Changing the supplier clears the lines.
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Expected delivery</span>
        <input
          type="date"
          name="expectedDeliveryAt"
          defaultValue={defaults.expectedDeliveryAt}
          className={INPUT}
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className={LABEL}>Lines</span>
        {rows.map((row) => {
          const product = products.find(
            (option) => option.id === row.productId,
          );
          return (
            <div
              key={row.key}
              className="grid grid-cols-[minmax(0,1fr)_72px_84px_auto] items-end gap-1.5"
            >
              <label className="flex min-w-0 flex-col gap-1">
                <span className="sr-only">Product</span>
                <select
                  name="productId"
                  value={row.productId}
                  onChange={(event) => chooseProduct(row, event.target.value)}
                  disabled={supplierId === ""}
                  className={`${INPUT} min-w-0 disabled:text-ink-muted`}
                >
                  <option value="">
                    {supplierId === ""
                      ? "Supplier first"
                      : supplierProducts.length === 0
                        ? "No products for this supplier"
                        : "Choose a product"}
                  </option>
                  {supplierProducts.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name} ({option.sku})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="sr-only">Quantity</span>
                <input
                  name="quantity"
                  inputMode="decimal"
                  placeholder="0"
                  value={row.quantity}
                  onChange={(event) =>
                    updateRow(row.key, { quantity: event.target.value })
                  }
                  className={`${INPUT} font-mono`}
                />
                <span className="text-[10.5px] text-ink-faint">
                  {product?.unitOfMeasure ?? "qty"}
                </span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="sr-only">Unit cost</span>
                <input
                  name="unitCost"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={row.unitCost}
                  onChange={(event) =>
                    updateRow(row.key, { unitCost: event.target.value })
                  }
                  className={`${INPUT} font-mono`}
                />
                <span className="text-[10.5px] text-ink-faint">unit cost</span>
              </label>
              <button
                type="button"
                onClick={() =>
                  setRows((current) =>
                    current.length === 1
                      ? current
                      : current.filter((item) => item.key !== row.key),
                  )
                }
                disabled={rows.length === 1}
                aria-label="Remove line"
                className="mb-[18px] inline-flex h-9 w-8 items-center justify-center rounded border border-line text-[15px] text-ink-muted hover:border-danger hover:text-danger disabled:opacity-40"
              >
                ×
              </button>
            </div>
          );
        })}

        <button
          type="button"
          onClick={() =>
            setRows((current) => [
              ...current,
              { key: nextKey++, productId: "", quantity: "", unitCost: "" },
            ])
          }
          disabled={supplierId === ""}
          className="mt-0.5 inline-flex min-h-[32px] items-center self-start rounded border border-line px-2.5 text-[12px] font-medium hover:border-accent hover:text-accent disabled:opacity-50"
        >
          Add line
        </button>
      </div>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Notes</span>
        <textarea
          name="notes"
          rows={2}
          maxLength={2000}
          defaultValue={defaults.notes}
          placeholder="Delivery instructions, account reference…"
          className="w-full rounded border border-line bg-surface px-2 py-1.5 text-[13px]"
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

      <div className="mt-0.5 flex items-center gap-2">
        <button
          type="submit"
          disabled={pending || supplierId === ""}
          className="inline-flex min-h-[36px] items-center rounded bg-accent px-3 text-[12px] font-semibold text-on-accent disabled:opacity-60"
        >
          {pending
            ? "Saving…"
            : mode === "create"
              ? "Save draft"
              : "Save changes"}
        </button>
        <Link
          href={cancelHref}
          className="inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-2.5 text-[12px] font-medium hover:border-accent hover:text-accent"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
