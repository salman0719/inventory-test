"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  saveProduct,
  type ProductFormState,
} from "@/app/(app)/products/actions";
import type { ProductDefaults } from "@/lib/product-defaults";
import type { CategoryOption, SupplierOption } from "@/lib/products";

const INPUT =
  "h-9 w-full rounded border border-line bg-surface px-2 text-[13px]";
const LABEL = "text-[10px] uppercase tracking-[0.07em] text-ink-muted";

const UNITS = [
  "ea",
  "kg",
  "g",
  "L",
  "mL",
  "box",
  "pack",
  "case",
  "bag",
  "bottle",
  "can",
  "roll",
  "dozen",
];

/** Prices arrive from Postgres as numeric strings, which the form shows as-is. */
function toField(value: string | null): string {
  return value ?? "";
}

export function ProductForm({
  defaults,
  categories,
  suppliers,
  cancelHref,
}: {
  defaults: ProductDefaults;
  categories: CategoryOption[];
  suppliers: SupplierOption[];
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState<
    ProductFormState,
    FormData
  >(saveProduct, {});

  return (
    <form action={formAction} className="flex flex-col gap-2.5">
      <input type="hidden" name="id" value={defaults.id} />

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Name</span>
        <input
          name="name"
          required
          maxLength={120}
          defaultValue={defaults.name}
          className={INPUT}
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className={LABEL}>SKU</span>
          <input
            name="sku"
            required
            maxLength={40}
            defaultValue={defaults.sku}
            className={`${INPUT} font-mono`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Unit</span>
          <input
            name="unitOfMeasure"
            required
            maxLength={12}
            list="product-units"
            defaultValue={defaults.unitOfMeasure}
            className={INPUT}
          />
          <datalist id="product-units">
            {UNITS.map((unit) => (
              <option key={unit} value={unit} />
            ))}
          </datalist>
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Category</span>
        <select
          name="categoryId"
          defaultValue={defaults.categoryId ?? ""}
          className={INPUT}
        >
          <option value="">No category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Supplier</span>
        <select
          name="supplierId"
          defaultValue={defaults.supplierId ?? ""}
          disabled={suppliers.length === 0}
          className={`${INPUT} disabled:text-ink-muted`}
        >
          <option value="">
            {suppliers.length === 0 ? "No suppliers yet" : "No supplier"}
          </option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
        {suppliers.length === 0 ? (
          <span className="text-[11px] text-ink-faint">
            Supplier records arrive with the suppliers slice.
          </span>
        ) : null}
      </label>

      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Cost</span>
          <input
            name="costPrice"
            required
            inputMode="decimal"
            defaultValue={defaults.costPrice}
            className={`${INPUT} font-mono`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Sell</span>
          <input
            name="sellingPrice"
            inputMode="decimal"
            placeholder="optional"
            defaultValue={toField(defaults.sellingPrice)}
            className={`${INPUT} font-mono`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Reorder</span>
          <input
            name="reorderLevel"
            required
            inputMode="decimal"
            defaultValue={defaults.reorderLevel}
            className={`${INPUT} font-mono`}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Description</span>
        <textarea
          name="description"
          rows={3}
          maxLength={2000}
          defaultValue={toField(defaults.description)}
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

      <div className="mt-1 flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-[36px] items-center rounded bg-accent px-3 text-[12px] font-semibold text-on-accent disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save product"}
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
