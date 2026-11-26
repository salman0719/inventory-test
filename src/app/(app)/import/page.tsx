import { ImportWorkbench } from "@/components/import/import-workbench";
import { NoBusinessNotice } from "@/components/no-business-notice";
import { getActiveBusiness } from "@/lib/businesses";
import { getImportPage } from "@/lib/csv-import";
import { getSessionUser } from "@/lib/session";

export default async function ImportPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const { active } = await getActiveBusiness(user.id);
  if (!active) return <NoBusinessNotice />;

  const data = await getImportPage(user.id, active.id);

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-[15px] font-semibold tracking-tight">Import</h1>
        <p className="text-[12px] text-ink-muted">
          Bring products in from a CSV, match the columns and review every row
          before anything is written.
        </p>
      </header>

      <ImportWorkbench data={data} currency={active.currencyCode} />
    </section>
  );
}
