import { redirect } from "next/navigation";
import { NoBusinessNotice } from "@/components/no-business-notice";
import { PendingLink } from "@/components/pending-link";
import { Scanner } from "@/components/scan/scanner";
import { getActiveBusiness } from "@/lib/businesses";
import { normalizeScanInput } from "@/lib/scan-code";
import { resolveScan } from "@/lib/scan";
import { getSessionUser } from "@/lib/session";

/**
 * The QR label's landing page. The label encodes `/scan/<product uuid>`, which
 * resolves through the session and RLS like every other product read. A missing
 * or foreign id is a plain not-found state, never a hint that the product exists
 * in another business.
 */
export default async function ScanCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = normalizeScanInput(rawCode).slice(0, 200);

  const user = await getSessionUser();
  if (!user) return null;

  const { active } = await getActiveBusiness(user.id);
  if (!active) return <NoBusinessNotice />;

  const result = await resolveScan(user.id, active.id, code);
  if (result.kind === "one") {
    redirect(`/products?product=${result.product.id}`);
  }

  return (
    <section className="mx-auto flex w-full max-w-[540px] flex-col gap-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-[15px] font-semibold tracking-tight">Scan</h1>
          <p className="text-[12px] text-ink-muted">
            {code ? `Code: ${code}` : "Find a product by its barcode or SKU."}
          </p>
        </div>
        <PendingLink
          href="/products"
          className="ml-auto inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-2.5 text-[12px] font-medium hover:border-accent hover:text-accent"
        >
          Products
        </PendingLink>
      </header>

      <Scanner
        code={code || undefined}
        matches={result.kind === "many" ? result.products : []}
        notFound={result.kind === "none"}
      />
    </section>
  );
}
