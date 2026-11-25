"use client";

import type { ReactNode } from "react";
import { setArchived, useLastPaidCost } from "@/app/(app)/products/actions";
import { ArchiveForm } from "@/components/archive-form";
import { PanelFrame } from "@/components/panel-frame";
import { EMPTY_PRODUCT } from "@/lib/product-defaults";
import { formatMoney, formatQuantity, stockStatus } from "@/lib/product-input";
import type {
  CategoryOption,
  ProductPriceHistory,
  ProductSupplierLink,
  ProductSummary,
  SupplierOption,
} from "@/lib/products";
import { PanelLink } from "../panel-link";
import { ProductForm } from "./product-form";
import { ProductSuppliers } from "./product-suppliers";
import { StatusLabel } from "./status-label";

const BUTTON =
  "inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-2.5 text-[12px] font-medium hover:border-accent hover:text-accent";

function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium" }).format(date);
}

/**
 * Direction C keeps details beside the list rather than on another page, so
 * scanning a supplier's catalogue does not lose the list position. The panel is
 * driven by the URL; every action inside it is a real link, form or server action.
 *
 * On a phone the frame pins the name, the SKU and Close at the top and Edit and
 * Archive at the bottom, so a destructive action never scrolls under a thumb.
 */
export function ProductPanel({
  mode,
  product,
  categories,
  suppliers,
  links,
  price,
  currency,
  saved,
  closeHref,
  editHref,
  canViewValues = true,
}: {
  mode: "create" | "edit" | "detail";
  product: ProductSummary | null;
  categories: CategoryOption[];
  suppliers: SupplierOption[];
  links: ProductSupplierLink[];
  price: ProductPriceHistory;
  currency: string;
  saved: boolean;
  closeHref: string;
  editHref?: string;
  /** Viewers see the stock position, not the money, and get no write controls. */
  canViewValues?: boolean;
}) {
  const title =
    mode === "create" ? "New product" : (product?.name ?? "Product");

  const actions =
    mode === "detail" && product && canViewValues ? (
      <>
        <PanelLink href={editHref ?? closeHref} className={BUTTON}>
          Edit
        </PanelLink>
        <ArchiveForm action={setArchived}>
          <input type="hidden" name="id" value={product.id} />
          <input
            type="hidden"
            name="archived"
            value={product.isArchived ? "false" : "true"}
          />
          <button type="submit" className={BUTTON}>
            {product.isArchived ? "Restore" : "Archive"}
          </button>
        </ArchiveForm>
      </>
    ) : undefined;

  return (
    <PanelFrame
      label="Product details"
      header={
        <>
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-semibold">{title}</h2>
            {mode !== "create" && product ? (
              <p className="font-mono text-[10.5px] text-ink-faint">
                {product.sku}
              </p>
            ) : null}
          </div>
          <PanelLink
            href={closeHref}
            aria-label="Close product panel"
            className={`${BUTTON} ml-auto shrink-0`}
          >
            Close
          </PanelLink>
        </>
      }
      footer={actions}
    >
      {mode === "create" || mode === "edit" ? (
        <div className="px-3 py-3">
          <ProductForm
            defaults={product ?? EMPTY_PRODUCT}
            categories={categories}
            suppliers={suppliers}
            links={links}
            cancelHref={closeHref}
          />
        </div>
      ) : product ? (
        <ProductBody
          product={product}
          suppliers={suppliers}
          links={links}
          price={price}
          currency={currency}
          saved={saved}
          canViewValues={canViewValues}
        />
      ) : null}
    </PanelFrame>
  );
}

function ProductBody({
  product,
  suppliers,
  links,
  price,
  currency,
  saved,
  canViewValues,
}: {
  product: ProductSummary;
  suppliers: SupplierOption[];
  links: ProductSupplierLink[];
  price: ProductPriceHistory;
  currency: string;
  saved: boolean;
  canViewValues: boolean;
}) {
  return (
    <>
      {saved ? (
        <p
          role="status"
          className="border-b border-line bg-success-soft px-3 py-1.5 text-[12px] text-success"
        >
          Product saved.
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-3">
        <Value label="On hand">
          <span className="inline-flex items-center gap-2">
            <span className="font-mono">
              {formatQuantity(product.onHand)} {product.unitOfMeasure}
            </span>
            <StatusLabel
              status={stockStatus(product.onHand, product.reorderLevel)}
            />
          </span>
        </Value>
        <Value label="Reorder at">
          <span className="font-mono">
            {formatQuantity(product.reorderLevel)}
          </span>
        </Value>
        {product.targetStockLevel !== null ? (
          <Value label="Target stock">
            <span className="font-mono">
              {formatQuantity(product.targetStockLevel)}
            </span>
          </Value>
        ) : null}
        {canViewValues ? (
          <>
            <Value label="Cost">
              <span className="font-mono">
                {formatMoney(product.costPrice, currency)}
              </span>
            </Value>
            <Value label="Selling price">
              <span className="font-mono">
                {formatMoney(product.sellingPrice, currency)}
              </span>
            </Value>
          </>
        ) : null}
        <Value label="Category">{product.categoryName ?? "—"}</Value>
        {product.barcode ? (
          <div className="col-span-2 min-w-0">
            <dt className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
              Barcode
            </dt>
            <dd className="font-mono text-[13px] break-all">
              {product.barcode}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="px-3 pb-3">
        <a href={`/products/labels?product=${product.id}`} className={BUTTON}>
          Print label
        </a>
      </div>

      <ProductSuppliers
        productId={product.id}
        links={links}
        suppliers={suppliers}
        canEdit={canViewValues}
      />

      {canViewValues ? (
        <div className="border-t border-line px-3 py-2">
          <h3 className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
            Purchase price
          </h3>
          {price.lastPaid ? (
            <>
              <p className="mt-1 text-[12px]">
                Last paid{" "}
                <span className="font-mono">
                  {formatMoney(price.lastPaid.unitCost, currency)}
                </span>{" "}
                per {product.unitOfMeasure} on{" "}
                {formatDay(price.lastPaid.receivedAt)} from{" "}
                {price.lastPaid.supplierName}.
              </p>
              <p className="mt-0.5 text-[11px] text-ink-faint">
                Cost above is the catalogue price; this is what the last
                delivery cost. Updating the cost leaves past receipts as they
                were.
              </p>
              {price.lastPaid.unitCost === product.costPrice ? (
                <p className="mt-1.5 text-[11px] text-ink-faint">
                  The catalogue cost already matches.
                </p>
              ) : (
                <form action={useLastPaidCost} className="mt-1.5">
                  {/* Only the product is posted: the action re-reads the latest
                      price, so the amount cannot be forged. */}
                  <input type="hidden" name="productId" value={product.id} />
                  <button type="submit" className={BUTTON}>
                    Use as cost
                  </button>
                </form>
              )}
              {price.entries.length > 1 ? (
                <ul className="mt-1.5 flex flex-col gap-0.5">
                  {price.entries.map((entry, index) => (
                    <li
                      key={`${entry.receivedAt}-${index}`}
                      className="flex items-baseline gap-2 text-[11.5px] text-ink-muted"
                    >
                      <span className="font-mono text-ink">
                        {formatMoney(entry.unitCost, currency)}
                      </span>
                      <span className="truncate">{entry.supplierName}</span>
                      <span className="ml-auto shrink-0">
                        {formatDay(entry.receivedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="mt-1 text-[12px] text-ink-muted">
              No deliveries received yet, so there is no last paid price.
            </p>
          )}
        </div>
      ) : null}

      {product.description ? (
        <p className="border-t border-line px-3 py-2 text-[12px] text-ink-muted">
          {product.description}
        </p>
      ) : null}

      {product.isArchived ? (
        <p className="border-t border-line px-3 py-2 text-[12px] text-warning">
          This product is archived. It keeps its history and stays out of stock
          screens until it is restored.
        </p>
      ) : null}
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
