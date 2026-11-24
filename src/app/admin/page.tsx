import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { StatusChip } from "@/components/admin/status-chip";
import {
  formatDay,
  getAdminOverview,
  listRegistrations,
  waitingLabel,
} from "@/lib/admin";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Admin — Stk" };

/**
 * The overview answers what a reviewer opens the panel to find out: is anything
 * waiting on me, is the queue growing, and is the platform actually producing
 * businesses. The queue below is the working screen — oldest first, one click into
 * the applicant's answers.
 */
export default async function AdminOverviewPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const [overview, pending] = await Promise.all([
    getAdminOverview(user.id),
    listRegistrations(user.id, { status: "pending", search: "" }),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="text-[10px] uppercase tracking-[0.08em] text-ink-muted">
          Admin
        </p>
        <h1 className="mt-0.5 text-[17px] font-semibold tracking-tight">
          Review
        </h1>
        <p className="text-[12px] text-ink-muted">
          Every business is opened by hand. Approving creates the business and
          makes the applicant its owner.
        </p>
      </header>

      <section
        aria-label="Figures"
        className="grid grid-cols-2 gap-2 min-[900px]:grid-cols-4"
      >
        <Tile
          href="/admin/registrations?status=pending"
          label="Waiting on you"
          value={overview.pending}
          note={overview.pending === 1 ? "registration" : "registrations"}
          tone={overview.pending > 0 ? "warning" : "plain"}
        />
        <Tile
          href="/admin/registrations"
          label="New this week"
          value={overview.newThisWeek}
          note={`${overview.decidedThisWeek} decided`}
        />
        <Tile
          href="/admin/businesses"
          label="Businesses"
          value={overview.businesses}
          note="open"
        />
        <Tile
          href="/admin/accounts"
          label="Accounts"
          value={overview.accounts}
          note={
            overview.unconfirmed > 0
              ? `${overview.unconfirmed} never confirmed`
              : "all confirmed"
          }
          tone={overview.unconfirmed > 0 ? "warning" : "plain"}
        />
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[13px] font-semibold">Queue</h2>
          <p className="text-[11.5px] text-ink-muted">
            {pending.length === 0
              ? "nothing waiting"
              : `${pending.length} waiting · oldest first`}
          </p>
          <Link
            href="/admin/registrations?status=pending"
            className="ml-auto text-[11.5px] text-ink-muted hover:text-accent"
          >
            Open the queue
          </Link>
        </div>

        {pending.length === 0 ? (
          <div className="rounded border border-dashed border-line bg-panel px-4 py-10 text-center">
            <p className="text-[13px] font-medium">Nothing waiting</p>
            <p className="mx-auto mt-1 max-w-[46ch] text-[12px] text-ink-muted">
              A registration appears here once the applicant opens the link in
              their confirmation email. Accounts that never confirm are counted
              above but cannot be reviewed.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line rounded border border-line bg-surface">
            {pending.map((request) => (
              <li key={request.id}>
                <Link
                  href={`/admin/registrations/${request.id}`}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2.5 hover:bg-panel"
                >
                  <span className="text-[13px] font-medium">
                    {request.businessName}
                  </span>
                  <span className="truncate text-[11.5px] text-ink-muted">
                    {request.fullName} · {request.email}
                  </span>
                  <span className="ml-auto text-[11px] text-ink-faint">
                    waiting {waitingLabel(request.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold">Recent decisions</h2>
        {overview.recent.length === 0 ? (
          <p className="text-[12px] text-ink-muted">
            No registration has been decided yet.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded border border-line bg-surface">
            {overview.recent.map((decision) => (
              <li key={decision.id}>
                <Link
                  href={`/admin/registrations/${decision.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 hover:bg-panel"
                >
                  <span className="text-[12.5px] font-medium">
                    {decision.businessName}
                  </span>
                  <StatusChip status={decision.status} />
                  <span className="ml-auto text-[11px] text-ink-faint">
                    {formatDay(new Date(decision.decidedAt))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Tile({
  label,
  value,
  note,
  href,
  tone = "plain",
}: {
  label: string;
  value: number;
  note: string;
  href?: string;
  tone?: "plain" | "warning";
}): ReactNode {
  const body = (
    <>
      <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
        {label}
      </span>
      <span
        className={`font-mono text-[20px] leading-tight ${
          tone === "warning" ? "text-warning" : "text-ink"
        }`}
      >
        {value}
      </span>
      <span className="text-[10.5px] text-ink-faint">{note}</span>
    </>
  );

  const className =
    "flex min-h-[74px] flex-col justify-center rounded border border-line bg-panel px-3 py-2";

  return href ? (
    <Link href={href} className={`${className} hover:border-accent`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
