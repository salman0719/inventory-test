"use client";

import { useActionState } from "react";
import {
  addCategory,
  type CategoryFormState,
} from "@/app/(app)/products/actions";

export function CategoryForm() {
  const [state, formAction, pending] = useActionState<
    CategoryFormState,
    FormData
  >(addCategory, {});

  return (
    <form action={formAction} className="flex flex-wrap items-start gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
          New category
        </span>
        <input
          name="name"
          required
          maxLength={60}
          placeholder="e.g. Packaging"
          className="h-9 w-[190px] rounded border border-line bg-surface px-2.5 text-[13px]"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="mt-[18px] inline-flex min-h-[36px] items-center rounded bg-accent px-3 text-[12px] font-semibold text-on-accent disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add"}
      </button>

      {state.error ? (
        <p role="alert" className="w-full text-[12px] text-danger">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="w-full text-[12px] text-success">
          Category added.
        </p>
      ) : null}
    </form>
  );
}
