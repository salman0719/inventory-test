import { getActiveBusiness } from "@/lib/businesses";

export default async function SettingsPage() {
  const { active } = await getActiveBusiness();
  if (!active) return null;

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-[15px] font-semibold tracking-tight">Settings</h1>
        <p className="text-[12px] text-ink-muted">
          Business profile, categories and demo reset.
        </p>
      </header>

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

      <p className="max-w-[60ch] text-[12px] text-ink-muted">
        These values are read from the local database and change when the
        business selector does. Editing, categories and demo reset arrive with
        the settings slice.
      </p>
    </section>
  );
}
