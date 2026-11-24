"use client";

import Link from "next/link";
import { useActionState, useState, type ChangeEvent } from "react";
import { register, type RegisterState } from "./actions";

const INPUT =
  "h-10 w-full rounded border border-line bg-surface px-2.5 text-[13px]";
const LABEL = "text-[10px] uppercase tracking-[0.07em] text-ink-muted";

const BUSINESS_TYPE_LABELS = [
  { value: "cafe", label: "Café or restaurant" },
  { value: "retail", label: "Retail shop" },
  { value: "other", label: "Something else" },
];

type Fields = {
  fullName: string;
  businessName: string;
  businessType: string;
  email: string;
  password: string;
};

const EMPTY: Fields = {
  fullName: "",
  businessName: "",
  businessType: "cafe",
  email: "",
  password: "",
};

export function RegisterForm() {
  const [state, formAction, pending] = useActionState<RegisterState, FormData>(
    register,
    {},
  );
  // Controlled, because React resets a form after every action and a rejected
  // registration must not wipe what the applicant typed. The password is not
  // echoed back into the form after a rejection, by design.
  const [fields, setFields] = useState<Fields>(EMPTY);

  function bind(key: keyof Fields) {
    return {
      name: key,
      value: key === "password" && state.error ? "" : fields[key],
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setFields((current) => ({ ...current, [key]: event.target.value })),
    };
  }

  if (state.sentTo) {
    return (
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-[14px] font-semibold">Check your email</h2>
          <p className="mt-1 text-[12px] text-ink-muted">
            We sent a confirmation link to{" "}
            <span className="font-medium text-ink">{state.sentTo}</span>. Open
            it to finish registering; then we review the account before it
            opens.
          </p>
        </div>
        <p className="text-[11px] text-ink-faint">
          Nothing after a few minutes? Check the spam folder, or{" "}
          <Link href="/register" className="underline hover:text-accent">
            start again with another address
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className={LABEL}>Your name</span>
        <input
          {...bind("fullName")}
          required
          autoComplete="name"
          maxLength={80}
          className={INPUT}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Business name</span>
        <input
          {...bind("businessName")}
          required
          autoComplete="organization"
          maxLength={80}
          className={INPUT}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Business type</span>
        <select {...bind("businessType")} className={INPUT}>
          {BUSINESS_TYPE_LABELS.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Email</span>
        <input
          {...bind("email")}
          type="email"
          required
          autoComplete="username"
          className={INPUT}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Password</span>
        <input
          {...bind("password")}
          type="password"
          required
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
          className={INPUT}
        />
        <span className="text-[11px] text-ink-faint">
          At least 8 characters.
        </span>
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
        className="mt-1 inline-flex min-h-[44px] items-center justify-center rounded bg-accent px-3 text-[13px] font-semibold text-on-accent disabled:opacity-60"
      >
        {pending ? "Creating the account…" : "Create account"}
      </button>

      <p className="text-[11px] text-ink-faint">
        Every business is checked by hand before it opens, so the next step
        after confirming your address is a short wait.
      </p>
    </form>
  );
}
