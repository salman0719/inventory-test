"use client";

import { useActionState } from "react";
import {
  addSupplierLink,
  makeDefaultSupplier,
  removeSupplierLink,
  type SupplierLinkFormState,
} from "@/app/(app)/products/actions";
import type { ProductSupplierLink, SupplierOption } from "@/lib/products";

const INPUT =
  "h-8 w-full rounded border border-line bg-surface px-2 text-[12px]";
const LABEL = "text-[10px] uppercase tracking-[0.07em] text-ink-muted";
const BUTTON =
  "inline-flex min-h-[30px] items-center rounded border border-line bg-surface px-2 text-[11.5px] font-medium hover:border-accent hover:text-accent disabled:opacity-50";

function leadTimeLabel(days: number | null): string {
  if (days === null) return "no lead time";
  if (days === 0) return "same day";
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/**
 * The product's supplier links. The default row is the one the catalogue and
 * stock screens name; every other active row is another wholesaler the product
 * can be ordered from. Only the default can be changed here by promoting an
 * alternate; the form's supplier select changes it from scratch.
 */
export function ProductSuppliers({
  productId,
  links,
  suppliers,
  unitOfMeasure,
  canEdit,
}: {
  productId: string;
  links: ProductSupplierLink[];
  suppliers: SupplierOption[];
  unitOfMeasure: string;
  canEdit: boolean;
}) {
  const linked = new Set(links.map((link) => link.supplierId));
  const available = suppliers.filter((supplier) => !linked.has(supplier.id));
  const [addState, addAction, adding] = useActionState<
    SupplierLinkFormState,
    FormData
  >(addSupplierLink, {});

  return (
    <section className="border-t border-line px-3 py-2">
      <h3 className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
        Suppliers
      </h3>
      <p className="mt-0.5 text-[11px] text-ink-faint">
        Every supplier here can be ordered from. The default is the one shown in
        the catalogue and stock screens.
      </p>

      {links.length === 0 ? (
        <p className="mt-1.5 text-[12px] text-warning">
          No supplier is linked. Edit the product to choose a default.
        </p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {links.map((link) => (
            <li
              key={link.id}
              className="rounded border border-line bg-panel px-2 py-1.5"
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[12.5px] font-medium">
                  {link.supplierName}
                </span>
                {link.isDefault ? (
                  <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-[0.05em] text-accent">
                    Default
                  </span>
                ) : null}
                <span className="ml-auto font-mono text-[10.5px] text-ink-faint">
                  {link.supplierSku ?? "no code"} ·{" "}
                  {leadTimeLabel(link.effectiveLeadTimeDays)}
                </span>
              </div>
              <p className="text-[10.5px] text-ink-faint">
                {link.leadTimeDays === null
                  ? "Using the supplier's lead time."
                  : `Lead time override: ${leadTimeLabel(link.leadTimeDays)}.`}{" "}
                Priced per {unitOfMeasure}.
              </p>
              {canEdit && !link.isDefault ? (
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <DefaultLinkForm productId={productId} linkId={link.id} />
                  <RemoveLinkForm productId={productId} linkId={link.id} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <form action={addAction} className="mt-2 flex flex-col gap-1.5">
          <input type="hidden" name="productId" value={productId} />
          <span className={LABEL}>Add another supplier</span>
          {available.length === 0 ? (
            <p className="text-[11.5px] text-ink-faint">
              Every active supplier is already linked.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-1.5">
                <select name="supplierId" required className={INPUT}>
                  <option value="">Choose a supplier</option>
                  {available.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
                <input
                  name="supplierSku"
                  maxLength={60}
                  placeholder="their code (optional)"
                  className={`${INPUT} font-mono`}
                />
              </div>
              <div className="flex flex-wrap items-end gap-1.5">
                <label className="flex min-w-[150px] flex-1 flex-col gap-1">
                  <span className={LABEL}>Lead time override</span>
                  <input
                    name="leadTimeDays"
                    inputMode="numeric"
                    placeholder="supplier default"
                    className={INPUT}
                  />
                </label>
                <button type="submit" disabled={adding} className={BUTTON}>
                  {adding ? "Adding…" : "Add supplier"}
                </button>
              </div>
            </>
          )}
          {addState?.error ? (
            <p role="alert" className="text-[11.5px] text-danger">
              {addState.error}
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}

function DefaultLinkForm({
  productId,
  linkId,
}: {
  productId: string;
  linkId: string;
}) {
  const [state, action, pending] = useActionState<
    SupplierLinkFormState,
    FormData
  >(makeDefaultSupplier, {});
  return (
    <form action={action} className="flex items-center gap-1.5">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="linkId" value={linkId} />
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? "Saving…" : "Make default"}
      </button>
      {state?.error ? (
        <span role="alert" className="text-[11px] text-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

function RemoveLinkForm({
  productId,
  linkId,
}: {
  productId: string;
  linkId: string;
}) {
  const [state, action, pending] = useActionState<
    SupplierLinkFormState,
    FormData
  >(removeSupplierLink, {});
  return (
    <form action={action} className="flex items-center gap-1.5">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="linkId" value={linkId} />
      <button
        type="submit"
        disabled={pending}
        className={`${BUTTON} hover:border-danger hover:text-danger`}
      >
        {pending ? "Removing…" : "Remove"}
      </button>
      {state?.error ? (
        <span role="alert" className="text-[11px] text-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
