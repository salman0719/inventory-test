import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";
import { approveRegistration, rejectRegistration } from "@/app/admin/actions";
import { StatusChip } from "@/components/admin/status-chip";
import {
  formatDay,
  getAdminBusiness,
  getRegistration,
  listBusinesses,
  matchBusinesses,
  waitingLabel,
  type BusinessIdentity,
  type Registration,
} from "@/lib/admin";
import { parseAdminSearch, parseAttachRole } from "@/lib/admin-input";
import { getSessionUser } from "@/lib/session";

const ERROR_COPY: Record<string, string> = {
  "not-admin": "That action needs a platform admin account.",
  missing: "That registration no longer exists.",
  "no-business": "That business no longer exists. Search for it again.",
  role: "Attach a colleague as staff or viewer; ownership is not changed from this screen.",
  rejected: "It was already rejected. The applicant can read your note.",
  approved: "It was already approved; the business exists.",
  invalid: "The request could not be read. Reload and try again.",
  failed: "The decision did not save. Try again.",
};

/** How many search hits to render: the picker is for confirming, not browsing. */
const SEARCH_HITS = 8;

type SearchParams = Record<string, string | string[] | undefined>;

function single(params: SearchParams, key: string): string {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

/**
 * One applicant's answers, and the decision.
 *
 * The decision is the only thing here that writes, and it writes through the
 * functions in `0008`/`0011` — never a direct update of `signup_requests`, so a
 * decision cannot half-apply.
 *
 * Approval has two outcomes now. Creating a business is the default. When the
 * requested name resembles businesses that already exist, they are shown first, and
 * the reviewer can attach the applicant to one as staff or viewer instead. Matching is
 * a suggestion on a normalised name; the reviewer's judgment is what decides, and
 * attaching never merges or moves any existing data.
 */
export default async function RegistrationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const query = await searchParams;

  // A malformed id would reach SQL as a cast error; it is a 404, not a 500.
  if (!z.uuid().safeParse(id).success) notFound();

  const user = await getSessionUser();
  if (!user) return null;

  const registration = await getRegistration(user.id, id);
  if (!registration) notFound();

  const done = single(query, "done");
  const error = single(query, "error");
  const pending = registration.status === "pending";

  // Only a decision needs the business it landed on; a waiting row has none.
  const approvedBusiness =
    registration.status === "approved" && registration.businessId
      ? await getAdminBusiness(user.id, registration.businessId)
      : null;

  const candidates = pending
    ? await matchBusinesses(user.id, registration.businessName)
    : [];
  const search = pending ? parseAdminSearch(single(query, "q")) : "";
  const found = search === "" ? [] : await listBusinesses(user.id, search);
  const attachedRole =
    single(query, "as") === "" ? null : parseAttachRole(query.as);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          href="/admin/registrations"
          className="text-[11.5px] text-ink-muted hover:text-accent"
        >
          ← Registrations
        </Link>
      </div>

      {done === "approved" ? (
        <Banner tone="success">
          {attachedRole !== null && approvedBusiness ? (
            <>
              Approved. {registration.fullName} can sign in to{" "}
              {approvedBusiness.name} as a {attachedRole}. No new business was
              created.
            </>
          ) : (
            <>
              Approved. {registration.businessName} is open and{" "}
              {registration.fullName} is its owner.
            </>
          )}
        </Banner>
      ) : null}
      {done === "rejected" ? (
        <Banner tone="danger">
          Rejected. The applicant sees your note when they next open the app.
        </Banner>
      ) : null}
      {error !== "" ? (
        <Banner tone="danger">{ERROR_COPY[error] ?? ERROR_COPY.failed}</Banner>
      ) : null}

      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-[17px] font-semibold tracking-tight">
          {registration.businessName}
        </h1>
        <StatusChip status={registration.status} />
      </header>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded border border-line bg-surface px-3 py-3 text-[12.5px] min-[600px]:grid-cols-2">
        <Row label="Applicant">{registration.fullName}</Row>
        <Row label="Account">{registration.email}</Row>
        <Row label="Business type">{typeLabel(registration.businessType)}</Row>
        <Row label="Requested">
          {formatDay(registration.createdAt)} · waiting{" "}
          {waitingLabel(registration.createdAt)}
        </Row>
        <Row label="Email link">
          {registration.emailConfirmed ? (
            "Confirmed"
          ) : (
            <span className="text-warning">Not confirmed yet</span>
          )}
        </Row>
        {registration.decidedAt ? (
          <Row label="Decided">{formatDay(registration.decidedAt)}</Row>
        ) : null}
        {registration.adminNote ? (
          <Row label="Note to the applicant">{registration.adminNote}</Row>
        ) : null}
      </dl>

      {pending ? (
        <div className="flex flex-col gap-3">
          <section className="rounded border border-line bg-surface px-3 py-3">
            <h2 className="text-[13px] font-semibold">Approve</h2>

            {candidates.length > 0 ? (
              <div className="mt-2 rounded border border-warning bg-warning-soft px-3 py-2.5">
                <p className="text-[12.5px] font-semibold">
                  {candidates.length === 1
                    ? "One existing business looks like this one"
                    : `${candidates.length} existing businesses look like this one`}
                </p>
                <p className="mt-0.5 text-[11.5px] text-ink-muted">
                  Matched on the requested name. If their claim is right, attach
                  them to it — opening a second {registration.businessName}{" "}
                  would give the same shop two catalogues and two stock ledgers.
                </p>
                <ul className="mt-2 flex flex-col gap-2">
                  {candidates.map((candidate) => (
                    <li
                      key={candidate.id}
                      className="rounded border border-line bg-surface px-2.5 py-2"
                    >
                      <BusinessLine
                        business={candidate}
                        exact={candidate.exact}
                      />
                      <AttachForm
                        requestId={registration.id}
                        business={candidate}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="mt-2 text-[11.5px] text-ink-muted">
              {candidates.length > 0
                ? `Opens a second business called ${registration.businessName} and makes ${registration.fullName} its owner. Use this only when no existing business is theirs.`
                : `Creates ${registration.businessName} and makes ${registration.fullName} its owner. They can open the dashboard straight away.`}
            </p>
            <form action={approveRegistration} className="mt-2.5">
              <input type="hidden" name="requestId" value={registration.id} />
              <button
                type="submit"
                className="min-h-[36px] rounded bg-accent px-3 text-[12px] font-semibold text-on-accent"
              >
                {candidates.length > 0
                  ? "Approve as a new business anyway"
                  : "Approve and open the business"}
              </button>
            </form>

            <div className="mt-3 border-t border-line pt-2.5">
              <h3 className="text-[12px] font-semibold">
                Joining a business that is not listed?
              </h3>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">
                Search every business by name, then attach this account as staff
                or viewer. Their catalogue is untouched; they gain access to it.
              </p>
              <form
                method="get"
                action={`/admin/registrations/${registration.id}`}
                className="mt-2 flex flex-wrap items-end gap-2"
              >
                <label className="flex min-w-[200px] flex-1 flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
                    Business name
                  </span>
                  <input
                    type="search"
                    name="q"
                    defaultValue={search}
                    maxLength={80}
                    placeholder="Bean & Gone"
                    className="min-h-[34px] rounded border border-line bg-surface px-2 text-[12.5px]"
                  />
                </label>
                <button
                  type="submit"
                  className="min-h-[34px] rounded border border-line bg-surface px-3 text-[12px] font-medium hover:border-accent hover:text-accent"
                >
                  Search
                </button>
              </form>

              {search !== "" ? (
                found.length === 0 ? (
                  <p className="mt-2 text-[12px] text-ink-muted">
                    No business matches “{search}”. Approving as a new business
                    is the only option for this applicant.
                  </p>
                ) : (
                  <>
                    <ul className="mt-2 flex flex-col gap-2">
                      {found.slice(0, SEARCH_HITS).map((business) => (
                        <li
                          key={business.id}
                          className="rounded border border-line bg-panel px-2.5 py-2"
                        >
                          <BusinessLine business={business} />
                          <AttachForm
                            requestId={registration.id}
                            business={business}
                          />
                        </li>
                      ))}
                    </ul>
                    {found.length > SEARCH_HITS ? (
                      <p className="mt-1.5 text-[11px] text-ink-faint">
                        Showing {SEARCH_HITS} of {found.length}. Add more of the
                        name to narrow it down.
                      </p>
                    ) : null}
                  </>
                )
              ) : null}
            </div>
          </section>

          <section className="rounded border border-line bg-surface px-3 py-3">
            <h2 className="text-[13px] font-semibold">Reject</h2>
            <p className="mt-0.5 text-[11.5px] text-ink-muted">
              No business or membership is created. The applicant signs in to a
              screen that shows this note.
            </p>
            <form action={rejectRegistration} className="mt-2.5">
              <input type="hidden" name="requestId" value={registration.id} />
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
                  Note to the applicant
                </span>
                <textarea
                  name="note"
                  rows={3}
                  maxLength={500}
                  placeholder="We could not verify the business."
                  className="rounded border border-line bg-surface px-2 py-1.5 text-[12.5px]"
                />
              </label>
              <button
                type="submit"
                className="mt-2 min-h-[36px] rounded border border-line bg-surface px-3 text-[12px] font-medium hover:border-danger hover:text-danger"
              >
                Reject this registration
              </button>
            </form>
          </section>
        </div>
      ) : (
        <DecisionSummary
          registration={registration}
          business={approvedBusiness}
        />
      )}
    </div>
  );
}

function typeLabel(type: Registration["businessType"]): string {
  return type === "cafe"
    ? "Café or restaurant"
    : type === "retail"
      ? "Retail shop"
      : "Something else";
}

/** What tells two businesses with the same name apart: age, size and who owns them. */
function BusinessLine({
  business,
  exact = false,
}: {
  business: BusinessIdentity;
  exact?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="text-[12.5px] font-medium">{business.name}</span>
      <span className="text-[11px] text-ink-faint">
        {typeLabel(business.businessType)}
      </span>
      {exact ? (
        <span className="rounded border border-warning bg-warning-soft px-1.5 text-[10px] font-semibold text-warning">
          same name
        </span>
      ) : null}
      <span className="text-[11px] text-ink-muted">
        since {formatDay(business.createdAt)} ·{" "}
        {business.members === 1 ? "1 member" : `${business.members} members`}
        {business.ownerEmail ? ` · ${business.ownerEmail}` : " · no owner"}
      </span>
    </div>
  );
}

function AttachForm({
  requestId,
  business,
}: {
  requestId: string;
  business: BusinessIdentity;
}) {
  return (
    <form
      action={approveRegistration}
      className="mt-1.5 flex flex-wrap items-end gap-2"
    >
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="businessId" value={business.id} />
      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
          Role
        </span>
        <select
          name="role"
          defaultValue="staff"
          className="min-h-[32px] rounded border border-line bg-surface px-2 text-[12px]"
        >
          <option value="staff">Staff</option>
          <option value="viewer">Viewer</option>
        </select>
      </label>
      <button
        type="submit"
        className="min-h-[32px] rounded border border-line bg-surface px-3 text-[12px] font-medium hover:border-accent hover:text-accent"
      >
        Attach to this business
      </button>
    </form>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
        {label}
      </dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "success" | "danger";
  children: ReactNode;
}) {
  const className =
    tone === "success"
      ? "border-success-soft bg-success-soft text-success"
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

function DecisionSummary({
  registration,
  business,
}: {
  registration: Registration;
  business: BusinessIdentity | null;
}) {
  if (registration.status === "approved") {
    return (
      <p className="rounded border border-line bg-panel px-3 py-2.5 text-[12px] text-ink-muted">
        Approved
        {registration.decidedAt
          ? ` on ${formatDay(registration.decidedAt)}`
          : ""}
        . {registration.fullName} can sign in to{" "}
        {business?.name ?? registration.businessName}.
      </p>
    );
  }

  return (
    <p className="rounded border border-line bg-panel px-3 py-2.5 text-[12px] text-ink-muted">
      Rejected
      {registration.decidedAt ? ` on ${formatDay(registration.decidedAt)}` : ""}
      . No business or membership was created; the applicant can still sign in
      to read the note.
    </p>
  );
}
