"use client";

import { useActionState, useState, type ChangeEvent } from "react";
import {
  saveProduct,
  type ProductFormState,
} from "@/app/(app)/products/actions";
import { PanelLink } from "@/components/panel-link";
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

type Fields = {
  name: string;
  sku: string;
  supplierSku: string;
  unitOfMeasure: string;
  categoryId: string;
  supplierId: string;
  costPrice: string;
  sellingPrice: string;
  reorderLevel: string;
  description: string;
};

function initialFields(defaults: ProductDefaults): Fields {
  return {
    name: defaults.name,
    sku: defaults.sku,
    supplierSku: toField(defaults.supplierSku),
    unitOfMeasure: defaults.unitOfMeasure,
    categoryId: defaults.categoryId ?? "",
    supplierId: defaults.supplierId ?? "",
    costPrice: defaults.costPrice,
    sellingPrice: toField(defaults.sellingPrice),
    reorderLevel: defaults.reorderLevel,
    description: toField(defaults.description),
  };
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
  // Controlled, because React resets an uncontrolled form after every action: a
  // rejected save (a duplicate SKU, a name that is too long) would otherwise wipe
  // everything the operator typed. MovementForm documents the same reason.
  const [fields, setFields] = useState<Fields>(() => initialFields(defaults));

  function bind(key: keyof Fields) {
    return {
      name: key,
      value: fields[key],
      onChange: (
        event: ChangeEvent<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >,
      ) => setFields((current) => ({ ...current, [key]: event.target.value })),
    };
  }

  return (
    <form action={formAction} className="flex flex-col gap-2.5">
      <input type="hidden" name="id" value={defaults.id} />

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Name</span>
        <input {...bind("name")} required maxLength={120} className={INPUT} />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className={LABEL}>SKU</span>
          <input
            {...bind("sku")}
            required
            maxLength={40}
            className={`${INPUT} font-mono`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Unit</span>
          <input
            {...bind("unitOfMeasure")}
            required
            maxLength={12}
            list="product-units"
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
        <select {...bind("categoryId")} className={INPUT}>
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
          {...bind("supplierId")}
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

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Supplier code</span>
        <input
          {...bind("supplierSku")}
          maxLength={60}
          placeholder="optional — the code on their invoice"
          className={`${INPUT} font-mono`}
        />
      </label>

      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Cost</span>
          <input
            {...bind("costPrice")}
            required
            inputMode="decimal"
            className={`${INPUT} font-mono`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Sell</span>
          <input
            {...bind("sellingPrice")}
            inputMode="decimal"
            placeholder="optional"
            className={`${INPUT} font-mono`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Reorder</span>
          <input
            {...bind("reorderLevel")}
            required
            inputMode="decimal"
            className={`${INPUT} font-mono`}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Description</span>
        <textarea
          {...bind("description")}
          rows={3}
          maxLength={2000}
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
        {/* Closes the panel the same way its Close button does: no page render. */}
        <PanelLink
          href={cancelHref}
          className="inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-2.5 text-[12px] font-medium hover:border-accent hover:text-accent"
        >
          Cancel
        </PanelLink>
      </div>
    </form>
  );
}
