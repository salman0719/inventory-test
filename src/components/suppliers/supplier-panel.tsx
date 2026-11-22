"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { PanelLink } from "@/components/panel-link";
import { setArchived } from "@/app/(app)/suppliers/actions";
import { ArchiveForm } from "@/components/archive-form";
import { EMPTY_SUPPLIER } from "@/lib/supplier-defaults";
import { formatQuantity } from "@/lib/product-input";
import type { SuppliedProduct, SupplierSummary } from "@/lib/suppliers";
import { SupplierForm } from "./supplier-form";

const BUTTON =
  "inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-2.5 text-[12px] font-medium hover:border-accent hover:text-accent";

export function SupplierPanel({
  mode,
  supplier,
  products,
  saved,
  closeHref,
  editHref,
}: {
  mode: "create" | "edit" | "detail";
  supplier: SupplierSummary | null;
  products: SuppliedProduct[];
  saved: boolean;
  closeHref: string;
  editHref?: string;
}) {
  const title =
    mode === "create" ? "New supplier" : (supplier?.name ?? "Supplier");

  return (
    <aside
      aria-label="Supplier details"
      className="rounded border border-line bg-surface"
    >
      <header className="flex items-start gap-2 border-b border-line px-3 py-2">
        <h2 className="min-w-0 truncate text-[13px] font-semibold">{title}</h2>
        <PanelLink
          href={closeHref}
          aria-label="Close supplier panel"
          className={`${BUTTON} ml-auto shrink-0`}
        >
          Close
        </PanelLink>
      </header>

      {mode === "create" || mode === "edit" ? (
        <div className="px-3 py-3">
          <SupplierForm
            defaults={supplier ?? EMPTY_SUPPLIER}
            cancelHref={closeHref}
          />
        </div>
      ) : supplier ? (
        <SupplierBody
          supplier={supplier}
          products={products}
          saved={saved}
          editHref={editHref ?? closeHref}
        />
      ) : null}
    </aside>
  );
}

function SupplierBody({
  supplier,
  products,
  saved,
  editHref,
}: {
  supplier: SupplierSummary;
  products: SuppliedProduct[];
  saved: boolean;
  editHref: string;
}) {
  return (
    <>
      {saved ? (
        <p
          role="status"
          className="border-b border-line bg-success-soft px-3 py-1.5 text-[12px] text-success"
        >
          Supplier saved.
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-3">
        <Value label="Contact">{supplier.contactName ?? "—"}</Value>
        <Value label="Phone">
          <span className="font-mono text-[12px]">{supplier.phone ?? "—"}</span>
        </Value>
        <Value label="Email">
          <span className="text-[12px]">{supplier.email ?? "—"}</span>
        </Value>
        <Value label="Products">
          <span className="font-mono">{supplier.productCount}</span>
        </Value>
      </dl>

      {supplier.address ? (
        <p className="border-t border-line px-3 py-2 text-[12px] text-ink-muted">
          {supplier.address}
        </p>
      ) : null}

      {supplier.notes ? (
        <p className="border-t border-line px-3 py-2 text-[12px] text-ink-muted">
          {supplier.notes}
        </p>
      ) : null}

      <div className="border-t border-line px-3 py-2">
        <h3 className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
          Products supplied
        </h3>
        {products.length === 0 ? (
          <p className="mt-1 text-[12px] text-ink-muted">
            No products reference this supplier yet. Set it on a product to see
            the line here.
          </p>
        ) : (
          <ul className="mt-1 flex flex-col gap-0.5">
            {products.map((product) => (
              <li
                key={product.id}
                className="flex items-baseline gap-2 text-[12px]"
              >
                <Link
                  href={`/products?product=${product.id}`}
                  className="truncate hover:text-accent"
                >
                  {product.name}
                </Link>
                <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-faint">
                  {product.sku} · {formatQuantity(product.onHand)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {supplier.productCount > products.length ? (
          <p className="mt-1 text-[11px] text-ink-faint">
            Showing the first {products.length} of {supplier.productCount}.
          </p>
        ) : null}
      </div>

      <p className="border-t border-line px-3 py-2 text-[11px] text-ink-faint">
        Purchase order history arrives with the purchase orders slice.
      </p>

      {supplier.isArchived ? (
        <p className="border-t border-line px-3 py-2 text-[12px] text-warning">
          This supplier is archived. Products keep their association, but the
          supplier is hidden from new orders and from the product form.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
        <PanelLink href={editHref} className={BUTTON}>
          Edit
        </PanelLink>
        <ArchiveForm action={setArchived}>
          <input type="hidden" name="id" value={supplier.id} />
          <input
            type="hidden"
            name="archived"
            value={supplier.isArchived ? "false" : "true"}
          />
          <button type="submit" className={BUTTON}>
            {supplier.isArchived ? "Restore" : "Archive"}
          </button>
        </ArchiveForm>
      </div>
    </>
  );
}

function Value({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
        {label}
      </dt>
      <dd className="truncate text-[13px]">{children}</dd>
    </div>
  );
}
