import { redirect } from "next/navigation";
import { NoBusinessNotice } from "@/components/no-business-notice";
import { PageHeader, headerActionSecondary } from "@/components/page-header";
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
      <PageHeader
        title="Scan"
        summary={
          code ? `Code: ${code}` : "Find a product by its barcode or SKU."
        }
        actions={
          <PendingLink href="/products" className={headerActionSecondary}>
            Products
          </PendingLink>
        }
      />

      <Scanner
        code={code || undefined}
        matches={result.kind === "many" ? result.products : []}
        notFound={result.kind === "none"}
      />
    </section>
  );
}
