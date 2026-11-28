import Link from "next/link";
import { NoBusinessNotice } from "@/components/no-business-notice";
import { PageHeader } from "@/components/page-header";
import { getActiveBusiness } from "@/lib/businesses";
import { getSessionUser } from "@/lib/session";

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const { active } = await getActiveBusiness(user.id);
  if (!active) return <NoBusinessNotice />;

  return (
    <section className="flex flex-col gap-4">
      <PageHeader title="Settings" summary="Business profile and imports." />

      <dl className="grid max-w-[560px] grid-cols-1 gap-2 min-[600px]:grid-cols-2">
        <div className="rounded border border-line bg-panel px-3 py-2">
          <dt className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
            Business
          </dt>
          <dd className="text-[13px] font-medium">{active.name}</dd>
        </div>
        <div className="rounded border border-line bg-panel px-3 py-2">
          <dt className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
            Type
          </dt>
          <dd className="text-[13px] font-medium capitalize">
            {active.businessType}
          </dd>
        </div>
        <div className="rounded border border-line bg-panel px-3 py-2">
          <dt className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
            Currency
          </dt>
          <dd className="font-mono text-[13px] font-medium">
            {active.currencyCode}
          </dd>
        </div>
        <div className="rounded border border-line bg-panel px-3 py-2">
          <dt className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
            Business id
          </dt>
          <dd className="truncate font-mono text-[11px] text-ink-muted">
            {active.id}
          </dd>
        </div>
      </dl>

      <section
        aria-labelledby="import-heading"
        className="max-w-[560px] rounded border border-line bg-surface"
      >
        <header className="border-b border-line px-3 py-2">
          <h2 id="import-heading" className="text-[13px] font-semibold">
            Import and export
          </h2>
          <p className="text-[11px] text-ink-muted">
            Bring products or suppliers in from a CSV, or download the template
            that matches the import exactly.
          </p>
        </header>
        <div className="flex flex-wrap items-center gap-2 px-3 py-3">
          <Link
            href="/import"
            className="inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-3 text-[12px] font-medium hover:border-accent hover:text-accent"
          >
            Import products
          </Link>
          <Link
            href="/import?kind=suppliers"
            className="inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-3 text-[12px] font-medium hover:border-accent hover:text-accent"
          >
            Import suppliers
          </Link>
          <span className="text-[11px] text-ink-muted">
            Supplier export and the round-trip follow in the next slice.
          </span>
        </div>
      </section>

      <p className="max-w-[60ch] text-[12px] text-ink-muted">
        Business name, type and currency are fixed for this prototype.
      </p>
    </section>
  );
}
