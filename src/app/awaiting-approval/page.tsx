import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOut, signOutAndRegister } from "@/app/(app)/actions";
import Link from "next/link";
import { isPlatformAdmin } from "@/lib/admin";
import { getSessionUser } from "@/lib/session";
import { getSignupRequest } from "@/lib/signup";

export const metadata: Metadata = { title: "Awaiting approval — Stk" };

/**
 * The screen a signed-in account sees before a business exists for it.
 *
 * `(app)/layout.tsx` sends a user with no membership here, so this is the one place
 * that has to explain the wait. The request row is read through the applicant's own
 * RLS policy; nobody else's registration is visible from here.
 *
 * A platform reviewer also has no business — on purpose — but nothing to wait for.
 * They are given the queue instead of an invitation to register, and the admin check
 * is only read when there is no request, so an applicant never pays for it.
 */
export default async function AwaitingApprovalPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const request = await getSignupRequest(user.id);
  const reviewer = request === null && (await isPlatformAdmin(user.id));

  return (
    <main className="flex min-h-dvh items-center justify-center bg-panel px-4 py-10">
      <div className="w-full max-w-[460px]">
        <div className="mb-3 flex items-baseline gap-2">
          <span className="text-[17px] font-bold tracking-tight">Stk</span>
          <span className="text-[11px] uppercase tracking-[0.07em] text-ink-muted">
            Inventory
          </span>
        </div>

        <div className="rounded border border-line bg-surface p-5">
          {reviewer ? (
            <>
              <h1 className="text-[14px] font-semibold">
                This account reviews registrations
              </h1>
              <p className="mt-1 text-[12px] text-ink-muted">
                {user.email} is on the platform admin list, so it has no
                business of its own. The review queue is where registrations are
                approved, attached or rejected.
              </p>
              <Link
                href="/admin"
                className="mt-4 inline-flex min-h-[40px] items-center rounded bg-accent px-3 text-[12px] font-semibold text-on-accent"
              >
                Open the review queue
              </Link>
            </>
          ) : request?.status === "pending" ? (
            <>
              <h1 className="text-[14px] font-semibold">
                Waiting for approval
              </h1>
              <p className="mt-1 text-[12px] text-ink-muted">
                Your account is created and your email is confirmed. We are
                checking{" "}
                <span className="font-medium text-ink">
                  {request.businessName}
                </span>{" "}
                before it opens; there is nothing else you need to do.
              </p>

              <dl className="mt-4 rounded border border-line bg-panel px-3 py-2.5 text-[12px]">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-muted">Requested</dt>
                  <dd className="font-medium">
                    {request.createdAt.toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </dd>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between gap-3">
                  <dt className="text-ink-muted">Account</dt>
                  <dd className="truncate font-medium">{user.email}</dd>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between gap-3">
                  <dt className="text-ink-muted">Status</dt>
                  <dd className="font-medium text-warning">In review</dd>
                </div>
              </dl>

              <p className="mt-3 text-[11px] text-ink-faint">
                Reload this page after we have approved it. We will use the
                address above if we need to ask anything.
              </p>
            </>
          ) : request?.status === "rejected" ? (
            <>
              <h1 className="text-[14px] font-semibold">
                This account was not approved
              </h1>
              <p className="mt-1 text-[12px] text-ink-muted">
                We could not open{" "}
                <span className="font-medium text-ink">
                  {request.businessName}
                </span>{" "}
                for this account. Nothing has been created, and there is no data
                to remove.
              </p>
              {request.adminNote ? (
                <p className="mt-3 rounded border border-line bg-panel px-2.5 py-2 text-[12px]">
                  {request.adminNote}
                </p>
              ) : null}
              <p className="mt-3 text-[11px] text-ink-faint">
                If that is unexpected, reply to the address that contacted you
                and we will look again.
              </p>
            </>
          ) : request?.status === "approved" ? (
            <>
              <h1 className="text-[14px] font-semibold">You are approved</h1>
              <p className="mt-1 text-[12px] text-ink-muted">
                {request.businessName} is open. Reload the dashboard to start.
              </p>
              <Link
                href="/"
                className="mt-4 inline-flex min-h-[40px] items-center rounded bg-accent px-3 text-[12px] font-semibold text-on-accent"
              >
                Open the dashboard
              </Link>
            </>
          ) : (
            <>
              <h1 className="text-[14px] font-semibold">
                This account has no business
              </h1>
              <p className="mt-1 text-[12px] text-ink-muted">
                {user.email} is signed in, but no business is linked to it and
                there is no registration waiting for review. If you registered
                with a different address, sign in with that one.
              </p>
              <p className="mt-3 text-[11px] text-ink-faint">
                The registration form is closed while an account is signed in,
                so registering this address starts by signing out.
              </p>
              <form action={signOutAndRegister}>
                <button
                  type="submit"
                  className="mt-2 inline-flex min-h-[40px] items-center rounded border border-line bg-surface px-3 text-[12px] font-medium hover:border-accent hover:text-accent"
                >
                  Sign out and register
                </button>
              </form>
            </>
          )}

          <form action={signOut} className="mt-4 border-t border-line pt-3">
            <button
              type="submit"
              className="min-h-[36px] rounded border border-line bg-surface px-2.5 text-[12px] font-medium hover:border-accent hover:text-accent"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
