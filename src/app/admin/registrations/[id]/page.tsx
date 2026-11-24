import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";
import { approveRegistration, rejectRegistration } from "@/app/admin/actions";
import { StatusChip } from "@/components/admin/status-chip";
import {
  formatDay,
  getRegistration,
  waitingLabel,
  type Registration,
} from "@/lib/admin";
import { getSessionUser } from "@/lib/session";

const ERROR_COPY: Record<string, string> = {
  "not-admin": "That action needs a platform admin account.",
  missing: "That registration no longer exists.",
  rejected: "It was already rejected. The applicant can read your note.",
  approved: "It was already approved; the business exists.",
  invalid: "The request could not be read. Reload and try again.",
  failed: "The decision did not save. Try again.",
};

type SearchParams = Record<string, string | string[] | undefined>;

function single(params: SearchParams, key: string): string {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

/**
 * One applicant's answers, and the decision.
 *
 * This is the only screen that changes a registration, and it changes it through the
 * functions from `0008` — no direct update of `signup_requests`, so a decision cannot
 * half-apply: the business, the owner membership and the status commit together.
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
          Approved. {registration.businessName} is open and{" "}
          {registration.fullName} is its owner.
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
        <Row label="Business type">
          {registration.businessType === "cafe"
            ? "Café or restaurant"
            : registration.businessType === "retail"
              ? "Retail shop"
              : "Something else"}
        </Row>
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

      {registration.status === "pending" ? (
        <div className="grid gap-3 min-[800px]:grid-cols-2">
          <section className="rounded border border-line bg-surface px-3 py-3">
            <h2 className="text-[13px] font-semibold">Approve</h2>
            <p className="mt-0.5 text-[11.5px] text-ink-muted">
              Creates {registration.businessName} and makes{" "}
              {registration.fullName} its owner. They can open the dashboard
              straight away.
            </p>
            <form action={approveRegistration} className="mt-2.5">
              <input type="hidden" name="requestId" value={registration.id} />
              <button
                type="submit"
                className="min-h-[36px] rounded bg-accent px-3 text-[12px] font-semibold text-on-accent"
              >
                Approve and open the business
              </button>
            </form>
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
        <DecisionSummary registration={registration} />
      )}
    </div>
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

function DecisionSummary({ registration }: { registration: Registration }) {
  if (registration.status === "approved") {
    return (
      <p className="rounded border border-line bg-panel px-3 py-2.5 text-[12px] text-ink-muted">
        Approved
        {registration.decidedAt
          ? ` on ${formatDay(registration.decidedAt)}`
          : ""}
        . The business exists and the applicant is its owner.
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
