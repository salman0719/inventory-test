import { redirect } from "next/navigation";
import { NoBusinessNotice } from "@/components/no-business-notice";
import { PendingLink } from "@/components/pending-link";
import { Scanner } from "@/components/scan/scanner";
import { getActiveBusiness } from "@/lib/businesses";
import { resolveScan } from "@/lib/scan";
import { getSessionUser } from "@/lib/session";

type SearchParams = Record<string, string | string[] | undefined>;

function single(params: SearchParams, key: string): string {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

/**
 * The manual scanner. A code in the query string is resolved on the server and a
 * single match redirects straight into the product panel, so a USB scanner or a
 * typed barcode costs one navigation. Several matches stay here as a chooser.
 *
 * The camera is progressive enhancement on Android; nothing about the manual path
 * depends on it.
 */
export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const user = await getSessionUser();
  if (!user) return null;

  const { active } = await getActiveBusiness(user.id);
  if (!active) return <NoBusinessNotice />;

  const code = single(params, "code").slice(0, 200);
  const result =
    code === "" ? null : await resolveScan(user.id, active.id, code);
  if (result?.kind === "one") {
    redirect(`/products?product=${result.product.id}`);
  }

  return (
    <section className="mx-auto flex w-full max-w-[540px] flex-col gap-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-[15px] font-semibold tracking-tight">Scan</h1>
          <p className="text-[12px] text-ink-muted">
            Find a product by its barcode, SKU or QR label.
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
        matches={result?.kind === "many" ? result.products : []}
        notFound={result?.kind === "none"}
      />
    </section>
  );
}
