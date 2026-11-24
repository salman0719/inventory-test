import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { confirmAccount } from "@/app/admin/actions";
import { formatDay, listAccounts } from "@/lib/admin";
import { parseAdminSearch } from "@/lib/admin-input";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Accounts — Admin — Stk" };
type SearchParams = Record<string, string | string[] | undefined>;

const STATUS_LABEL: Record<string, string> = {
  pending: "waiting",
  approved: "approved",
  rejected: "rejected",
};

const ERROR_COPY: Record<string, string> = {
  "not-admin": "That action needs a platform admin account.",
  missing: "That account no longer exists.",
  answers:
    "The registration answers stored on that account are not valid. Nothing was changed.",
  invalid: "The request could not be read. Reload and try again.",
  failed: "The confirmation did not save. Try again.",
};

function single(params: SearchParams, key: string): string {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

/**
 * Everyone with a sign-in, including the accounts that never registered or never
 * confirmed, and the one way this screen writes: vouching for an address.
 *
 * "Confirmed" here means a reviewer said so, not that the inbox was proved — the email
 * link is still the normal path. Confirming also files the registration from the
 * sign-up metadata, because approval needs a request row and nothing else writes one
 * while confirmation is on. An account with two businesses appears twice, once per
 * membership, which is the honest shape of the data.
 */
export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const search = parseAdminSearch(params.q);
  const done = single(params, "done");
  const filed = single(params, "filed") === "1";
  const error = single(params, "error");

  const user = await getSessionUser();
  if (!user) return null;

  const rows = await listAccounts(user.id, search);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-[17px] font-semibold tracking-tight">Accounts</h1>
        <p className="text-[12px] text-ink-muted">
          {rows.length} {rows.length === 1 ? "account" : "rows"}
          {search ? " match this search" : ""}
        </p>
      </header>

      <p className="max-w-[80ch] text-[11.5px] text-ink-faint">
        An unconfirmed account cannot sign in. Confirming an address vouches for
        it and files the registration the sign-up form supplied, which is what
        puts it in the queue. It does not approve anything.
      </p>

      {done === "confirmed" ? (
        <Banner tone={filed ? "success" : "warning"}>
          {filed
            ? "Address confirmed and the registration filed. It is waiting in Registrations."
            : "Address confirmed. That account carried no usable registration answers, so nothing was added to the queue."}
        </Banner>
      ) : null}
      {error !== "" ? (
        <Banner tone="danger">{ERROR_COPY[error] ?? ERROR_COPY.failed}</Banner>
      ) : null}

      <form
        method="get"
        action="/admin/accounts"
        className="flex flex-wrap items-end gap-2 rounded border border-line bg-panel px-3 py-2.5"
      >
        <label className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
            Search
          </span>
          <input
            type="search"
            name="q"
            defaultValue={search}
            maxLength={80}
            placeholder="Email or business"
            className="min-h-[34px] rounded border border-line bg-surface px-2 text-[12.5px]"
          />
        </label>
        <button
          type="submit"
          className="min-h-[34px] rounded bg-accent px-3 text-[12px] font-semibold text-on-accent"
        >
          Search
        </button>
        {search ? (
          <Link
            href="/admin/accounts"
            className="min-h-[34px] content-center text-[12px] text-ink-muted hover:text-accent"
          >
            Clear
          </Link>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <div className="rounded border border-dashed border-line bg-panel px-4 py-12 text-center">
          <p className="text-[13px] font-medium">No accounts match</p>
          <p className="mx-auto mt-1 max-w-[46ch] text-[12px] text-ink-muted">
            Search a full or partial email, or a business name.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line rounded border border-line bg-surface">
          {rows.map((row) => (
            <li
              key={`${row.userId}-${row.businessId ?? "none"}`}
              className="flex flex-col gap-1 px-3 py-2.5"
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-[12.5px] font-medium">{row.email}</span>
                {row.emailConfirmed ? null : (
                  <span className="text-[11px] text-warning">
                    address not confirmed
                  </span>
                )}
                <span className="ml-auto text-[11px] text-ink-faint">
                  joined {formatDay(row.createdAt)}
                </span>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11.5px] text-ink-muted">
                {row.businessName ? (
                  <span>
                    {row.businessName}
                    {row.role ? (
                      <span className="text-ink-faint"> · {row.role}</span>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-ink-faint">No business</span>
                )}
                <span className="text-ink-faint">
                  registration{" "}
                  {row.registrationStatus
                    ? STATUS_LABEL[row.registrationStatus]
                    : "never filed"}
                </span>
                {row.emailConfirmed ? null : (
                  <form action={confirmAccount} className="ml-auto">
                    <input type="hidden" name="accountId" value={row.userId} />
                    <button
                      type="submit"
                      className="min-h-[30px] rounded border border-line bg-surface px-2.5 text-[11.5px] font-medium hover:border-accent hover:text-accent"
                    >
                      Confirm address
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "success" | "warning" | "danger";
  children: ReactNode;
}) {
  const className =
    tone === "success"
      ? "border-success-soft bg-success-soft text-success"
      : tone === "warning"
        ? "border-warning-soft bg-warning-soft text-warning"
        : "border-danger-soft bg-danger-soft text-danger";
  return (
    <p
      role="status"
      className={`rounded border px-3 py-2 text-[12px] ${className}`}
    >
      {children}
    </p>
  );
}
