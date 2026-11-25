import { ActivityRow } from "@/components/activity/activity-row";
import { PendingLink } from "@/components/pending-link";
import { NoBusinessNotice } from "@/components/no-business-notice";
import {
  ACTIVITY_FILTERS,
  getActivityPage,
  parseActivityFilter,
  type ActivityEntry,
} from "@/lib/activity";
import { getActiveBusiness } from "@/lib/businesses";
import { getSessionUser } from "@/lib/session";

type SearchParams = Record<string, string | string[] | undefined>;

function single(params: SearchParams, key: string): string {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

/** Keep the current filter in a link, overriding only what changes. */
function hrefFor(
  filter: string,
  cursor?: { before: string; beforeId: string },
): string {
  const search = new URLSearchParams();
  if (filter !== "all") search.set("filter", filter);
  if (cursor) {
    search.set("before", cursor.before);
    search.set("id", cursor.beforeId);
  }
  const query = search.toString();
  return query ? `/activity?${query}` : "/activity";
}

/**
 * Activity: who changed what, newest first.
 *
 * Reads `activity_log` through one function so the actor's email comes with the
 * event; nothing here is derived from the ledger, which keeps the feed a record of
 * decisions rather than a second copy of stock movements.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const user = await getSessionUser();
  if (!user) return null;

  const { active } = await getActiveBusiness(user.id);
  if (!active) return <NoBusinessNotice />;

  const filter = parseActivityFilter(single(params, "filter"));
  const { entries, next } = await getActivityPage(user.id, active.id, {
    filter,
    before: single(params, "before"),
    beforeId: single(params, "id"),
  });

  const filtered = filter !== "all";

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h1 className="text-[15px] font-semibold tracking-tight">Activity</h1>
        <p className="text-[12px] text-ink-muted">
          {filtered
            ? "Changes of this kind, newest first."
            : "Everything changed in this business, newest first."}{" "}
          · {active.name}
        </p>
      </header>

      <nav aria-label="Activity filters" className="flex flex-wrap gap-1">
        {ACTIVITY_FILTERS.map((option) => {
          const current = option.value === filter;
          return (
            <PendingLink
              key={option.value}
              href={hrefFor(option.value)}
              aria-current={current ? "page" : undefined}
              className={`inline-flex min-h-[32px] items-center rounded border px-2.5 text-[12px] ${
                current
                  ? "border-accent bg-accent-soft font-medium text-accent"
                  : "border-line bg-surface text-ink-muted hover:border-accent hover:text-accent"
              }`}
            >
              {option.label}
            </PendingLink>
          );
        })}
      </nav>

      {entries.length === 0 ? (
        <div className="rounded border border-dashed border-line bg-panel px-4 py-12 text-center">
          <p className="text-[13px] font-medium">
            {filtered ? "Nothing of this kind yet" : "Nothing has happened yet"}
          </p>
          <p className="mx-auto mt-1 max-w-[46ch] text-[12px] text-ink-muted">
            {filtered
              ? "Choose Everything to see the rest of the history."
              : "Adding a product, ordering stock or receiving a delivery is recorded here, with who did it."}
          </p>
        </div>
      ) : (
        <ActivityFeed entries={entries} />
      )}

      {next ? (
        <div className="flex justify-center">
          <PendingLink
            href={hrefFor(filter, next)}
            className="inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-3 text-[12px] font-medium hover:border-accent hover:text-accent"
          >
            Older activity
          </PendingLink>
        </div>
      ) : null}
    </section>
  );
}

const DAY = new Intl.DateTimeFormat("en-AU", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
/** A date key in local time, so "Today" follows the operator's clock. */
function dayKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(iso: string, now = new Date()): string {
  if (dayKey(iso) === dayKey(now.toISOString())) return "Today";
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return "Yesterday";
  return DAY.format(new Date(iso));
}

function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  const groups: { label: string; entries: ActivityEntry[] }[] = [];
  for (const entry of entries) {
    const label = dayLabel(entry.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.entries.push(entry);
    else groups.push({ label, entries: [entry] });
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.label} className="flex flex-col gap-1.5">
          <h2 className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
            {group.label}
          </h2>
          <ul className="divide-y divide-line rounded border border-line bg-panel">
            {group.entries.map((entry) => (
              <li key={entry.id}>
                <ActivityRow entry={entry} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
