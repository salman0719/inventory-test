import type { Metadata } from "next";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in — Stk" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-panel px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-3 flex items-baseline gap-2">
          <span className="text-[17px] font-bold tracking-tight">Stk</span>
          <span className="text-[11px] uppercase tracking-[0.07em] text-ink-muted">
            Inventory
          </span>
        </div>
        <div className="rounded border border-line bg-surface p-5">
          <h1 className="text-[14px] font-semibold">Sign in</h1>
          <p className="mb-4 text-[12px] text-ink-muted">
            Use your business account to open its stock and purchasing data.
          </p>
          <SignInForm next={next} />
        </div>
        <p className="mt-3 text-[11px] text-ink-faint">
          Accounts are created in Supabase. There is no self-service sign-up in
          this prototype.
        </p>
      </div>
    </main>
  );
}
