import type { Metadata } from "next";
import Link from "next/link";
import { StatusChip } from "@/components/admin/status-chip";
import { formatDay, listRegistrations, waitingLabel } from "@/lib/admin";
import { parseRegistrationFilter } from "@/lib/admin-input";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Registrations — Admin — Stk" };

type SearchParams = Record<string, string | string[] | undefined>;

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Waiting" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

/**
 * The queue and its history. Filter state lives in the URL, so a link to "the
 * rejections" or a search for an address is shareable and survives a reload. The
 * filter is parsed (`parseRegistrationFilter`) before it reaches SQL.
 */
export default async function RegistrationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filter = parseRegistrationFilter({
    status: params.status,
    q: params.q,
  });

  const user = await getSessionUser();
  if (!user) return null;

  const rows = await listRegistrations(user.id, filter);
  const filtered = filter.status !== "all" || filter.search !== "";
  const waiting = rows.filter((row) => row.status === "pending").length;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-[17px] font-semibold tracking-tight">
          Registrations
        </h1>
        <p className="text-[12px] text-ink-muted">
          {rows.length} {rows.length === 1 ? "registration" : "registrations"}
          {filter.status === "all" && !filtered && waiting > 0
            ? ` · ${waiting} waiting`
            : ""}
        </p>
      </header>

      <form
        method="get"
        action="/admin/registrations"
        className="flex flex-wrap items-end gap-2 rounded border border-line bg-panel px-3 py-2.5"
      >
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
            Status
          </span>
          <select
            name="status"
            defaultValue={filter.status}
            className="min-h-[34px] rounded border border-line bg-surface px-2 text-[12.5px]"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[200px] flex-1 flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
            Search
          </span>
          <input
            type="search"
            name="q"
            defaultValue={filter.search}
            maxLength={80}
            placeholder="Name, email or business"
            className="min-h-[34px] rounded border border-line bg-surface px-2 text-[12.5px]"
          />
        </label>

        <button
          type="submit"
          className="min-h-[34px] rounded bg-accent px-3 text-[12px] font-semibold text-on-accent"
        >
          Filter
        </button>
        {filtered ? (
          <Link
            href="/admin/registrations"
            className="min-h-[34px] content-center text-[12px] text-ink-muted hover:text-accent"
          >
            Clear
          </Link>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <div className="rounded border border-dashed border-line bg-panel px-4 py-12 text-center">
          <p className="text-[13px] font-medium">
            {filtered ? "No registrations match" : "No registrations yet"}
          </p>
          <p className="mx-auto mt-1 max-w-[46ch] text-[12px] text-ink-muted">
            {filtered
              ? "Clear the filters, or search for a different name, address or business."
              : "Every self-service registration appears here once the applicant confirms their address."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line rounded border border-line bg-surface">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/admin/registrations/${row.id}`}
                className="flex flex-col gap-1 px-3 py-2.5 hover:bg-panel"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[13px] font-medium">
                    {row.businessName}
                  </span>
                  <StatusChip status={row.status} />
                  <span className="ml-auto text-[11px] text-ink-faint">
                    {row.status === "pending"
                      ? `waiting ${waitingLabel(row.createdAt)}`
                      : row.decidedAt
                        ? `decided ${formatDay(row.decidedAt)}`
                        : `filed ${formatDay(row.createdAt)}`}
                  </span>
                </div>
                <div className="truncate text-[11.5px] text-ink-muted">
                  {row.fullName} · {row.email}
                  {row.emailConfirmed ? "" : " · address not confirmed"}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
