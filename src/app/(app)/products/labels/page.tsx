import { headers } from "next/headers";
import QRCode from "qrcode";
import { NoBusinessNotice } from "@/components/no-business-notice";
import { PendingLink } from "@/components/pending-link";
import { PrintButton } from "@/components/products/print-button";
import { resolveAppOrigin } from "@/lib/app-origin";
import { getActiveBusiness } from "@/lib/businesses";
import {
  LABELS_PER_PAGE,
  LABEL_LIMIT,
  getProductLabels,
  labelPageCount,
  scanUrl,
} from "@/lib/product-labels";
import { getSessionUser } from "@/lib/session";

type SearchParams = Record<string, string | string[] | undefined>;

function single(params: SearchParams, key: string): string {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

/**
 * A4 label sheet. Three columns by seven rows of 63.5 × 38.1 mm labels fit the
 * printable area; the local plan's 3 × 8 grid is 304.8 mm tall, which is taller
 * than A4, so it would clip the last row.
 *
 * The QR is rendered on the server as SVG, so this page adds no QR bundle to the
 * client. The only interactive control is the browser's print dialog.
 */
export default async function ProductLabelsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const user = await getSessionUser();
  if (!user) return null;

  const { active } = await getActiveBusiness(user.id);
  if (!active) return <NoBusinessNotice />;

  const productId = single(params, "product").slice(0, 64);
  const q = single(params, "q").slice(0, 80);
  const categoryId = single(params, "cat").slice(0, 64);
  const archived = single(params, "archived") === "true";

  const { labels, total } = await getProductLabels(user.id, active.id, {
    productId: productId || undefined,
    search: q,
    categoryId,
    includeArchived: archived,
  });

  const requestHeaders = await headers();
  const origin = resolveAppOrigin({
    forwardedHost: requestHeaders.get("x-forwarded-host"),
    host: requestHeaders.get("host"),
    protocol: requestHeaders.get("x-forwarded-proto"),
    configured: process.env.APP_URL,
  });

  const printed = await Promise.all(
    labels.map(async (label) => ({
      ...label,
      qr: await QRCode.toString(scanUrl(origin, label.id), {
        type: "svg",
        margin: 0,
        width: 128,
        errorCorrectionLevel: "M",
      }),
    })),
  );

  const pages = Array.from(
    { length: Math.ceil(printed.length / LABELS_PER_PAGE) },
    (_, index) =>
      printed.slice(index * LABELS_PER_PAGE, (index + 1) * LABELS_PER_PAGE),
  );
  const filtered = q !== "" || categoryId !== "" || archived;

  return (
    <div className="label-page flex flex-col gap-4">
      <header className="label-toolbar flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-[15px] font-semibold tracking-tight">
            {productId ? "Product label" : "Product labels"}
          </h1>
          <p className="text-[12px] text-ink-muted">
            {total} label{total === 1 ? "" : "s"}
            {filtered ? " match these filters" : ""} ·{" "}
            {labelPageCount(printed.length)} page
            {labelPageCount(printed.length) === 1 ? "" : "s"} · A4
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <PendingLink
            href={productId ? `/products?product=${productId}` : "/products"}
            className="inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-2.5 text-[12px] font-medium hover:border-accent hover:text-accent"
          >
            Back
          </PendingLink>
          {printed.length > 0 ? <PrintButton /> : null}
        </div>
      </header>

      <p className="label-toolbar text-[12px] text-ink-muted">
        Print at 100%, with no additional scaling. Each label is 63.5 × 38.1 mm.
      </p>

      {total > labels.length ? (
        <p
          role="status"
          className="label-toolbar rounded border border-line bg-warning-soft px-3 py-2 text-[12px] text-warning"
        >
          Showing the first {LABEL_LIMIT} labels. Narrow the search or choose a
          category to print the rest.
        </p>
      ) : null}

      {printed.length > 0 ? (
        <div className="max-w-full overflow-x-auto">
          {pages.map((page, pageIndex) => (
            <div className="label-sheet" key={pageIndex}>
              {page.map((label) => (
                <div className="label" key={label.id}>
                  <div
                    className="label-qr"
                    aria-hidden
                    dangerouslySetInnerHTML={{ __html: label.qr }}
                  />
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-[10.5px] leading-tight font-semibold">
                      {label.name}
                    </p>
                    <p className="mt-1 font-mono text-[8.5px] text-ink-muted">
                      {label.sku}
                    </p>
                    {label.supplierSku ? (
                      <p className="mt-0.5 truncate font-mono text-[8px] text-ink-faint">
                        {label.supplierSku}
                      </p>
                    ) : null}
                    {label.barcode ? (
                      <p className="mt-0.5 truncate font-mono text-[8px] text-ink-faint">
                        {label.barcode}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded border border-dashed border-line bg-panel px-4 py-12 text-center">
          <p className="text-[13px] font-medium">No products to label</p>
          <p className="mx-auto mt-1 max-w-[46ch] text-[12px] text-ink-muted">
            {productId
              ? "That product is not in this business."
              : "Clear the filters or add a product, then print again."}
          </p>
          <PendingLink
            href="/products"
            className="mt-4 inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-3 text-[12px] font-medium hover:border-accent hover:text-accent"
          >
            Back to products
          </PendingLink>
        </div>
      )}
    </div>
  );
}
