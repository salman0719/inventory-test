import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create an account — Stk" };

export default function RegisterPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-panel px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-3 flex items-baseline gap-2">
          <span className="text-[17px] font-bold tracking-tight">Stk</span>
          <span className="text-[11px] uppercase tracking-[0.07em] text-ink-muted">
            Inventory
          </span>
        </div>
        <div className="rounded border border-line bg-surface p-5">
          <h1 className="text-[14px] font-semibold">Create an account</h1>
          <p className="mb-4 text-[12px] text-ink-muted">
            One account per business owner. We review every registration before
            the business opens.
          </p>
          <RegisterForm />
        </div>
        <p className="mt-3 text-[11px] text-ink-faint">
          Already have an account?{" "}
          <Link href="/sign-in" className="underline hover:text-accent">
            Sign in
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
