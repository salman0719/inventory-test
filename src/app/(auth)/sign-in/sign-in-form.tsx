"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "./actions";

const initialState: SignInState = {};

export function SignInForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
          Email
        </span>
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          autoFocus
          className="h-10 rounded border border-line bg-surface px-2.5 text-[13px]"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
          Password
        </span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="h-10 rounded border border-line bg-surface px-2.5 text-[13px]"
        />
      </label>

      {state.error ? (
        <p
          role="alert"
          className="rounded border border-line bg-danger-soft px-2.5 py-2 text-[12px] text-danger"
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 inline-flex min-h-[40px] items-center justify-center rounded bg-accent px-3 text-[13px] font-semibold text-on-accent disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
