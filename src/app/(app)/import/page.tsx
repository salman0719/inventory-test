import Link from "next/link";
import { ImportWorkbench } from "@/components/import/import-workbench";
import { SupplierImportWorkbench } from "@/components/import/supplier-import-workbench";
import { NoBusinessNotice } from "@/components/no-business-notice";
import { PageHeader } from "@/components/page-header";
import { getActiveBusiness } from "@/lib/businesses";
import { getImportPage } from "@/lib/csv-import";
import { getSessionUser } from "@/lib/session";

type SearchParams = Record<string, string | string[] | undefined>;

const KINDS = [
  {
    key: "products",
    label: "Products",
    href: "/import",
    blurb:
      "Bring products in from a CSV, match the columns and review every row before anything is written.",
  },
  {
    key: "suppliers",
    label: "Suppliers",
    href: "/import?kind=suppliers",
    blurb:
      "Add or update suppliers from a list, with contact details and lead times, before anything is written.",
  },
] as const;

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const kind = params.kind === "suppliers" ? "suppliers" : "products";
  const current = KINDS.find((entry) => entry.key === kind) ?? KINDS[0];

  const user = await getSessionUser();
  if (!user) return null;

  const { active } = await getActiveBusiness(user.id);
  if (!active) return <NoBusinessNotice />;

  const data = await getImportPage(user.id, active.id);

  return (
    <section className="flex flex-col gap-4">
      <PageHeader title="Import" summary={current.blurb} />

      <nav aria-label="What to import" className="flex flex-wrap gap-1.5">
        {KINDS.map((entry) => {
          const isActive = entry.key === kind;
          return (
            <Link
              key={entry.key}
              href={entry.href}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex min-h-[32px] items-center rounded border px-2.5 text-[12px] font-medium ${
                isActive
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-surface text-ink-muted hover:border-accent hover:text-accent"
              }`}
            >
              {entry.label}
            </Link>
          );
        })}
      </nav>

      {kind === "suppliers" ? (
        <SupplierImportWorkbench data={data} />
      ) : (
        <ImportWorkbench data={data} currency={active.currencyCode} />
      )}
    </section>
  );
}
