"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  saveSupplier,
  type SupplierFormState,
} from "@/app/(app)/suppliers/actions";
import type { SupplierDefaults } from "@/lib/supplier-defaults";

const INPUT =
  "h-9 w-full rounded border border-line bg-surface px-2 text-[13px]";
const LABEL = "text-[10px] uppercase tracking-[0.07em] text-ink-muted";

function toField(value: string | null): string {
  return value ?? "";
}

export function SupplierForm({
  defaults,
  cancelHref,
}: {
  defaults: SupplierDefaults;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState<
    SupplierFormState,
    FormData
  >(saveSupplier, {});

  return (
    <form action={formAction} className="flex flex-col gap-2.5">
      <input type="hidden" name="id" value={defaults.id} />

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Business name</span>
        <input
          name="name"
          required
          maxLength={120}
          defaultValue={defaults.name}
          className={INPUT}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Contact name</span>
        <input
          name="contactName"
          maxLength={80}
          placeholder="optional"
          defaultValue={toField(defaults.contactName)}
          className={INPUT}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Email</span>
        <input
          name="email"
          type="email"
          maxLength={120}
          placeholder="optional"
          defaultValue={toField(defaults.email)}
          className={INPUT}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Phone</span>
        <input
          name="phone"
          maxLength={40}
          placeholder="optional"
          defaultValue={toField(defaults.phone)}
          className={INPUT}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Address</span>
        <textarea
          name="address"
          rows={2}
          maxLength={200}
          placeholder="optional"
          defaultValue={toField(defaults.address)}
          className="w-full rounded border border-line bg-surface px-2 py-1.5 text-[13px]"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Notes</span>
        <textarea
          name="notes"
          rows={3}
          maxLength={2000}
          placeholder="delivery days, order cut-off, account terms"
          defaultValue={toField(defaults.notes)}
          className="w-full rounded border border-line bg-surface px-2 py-1.5 text-[13px]"
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

      <div className="mt-1 flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-[36px] items-center rounded bg-accent px-3 text-[12px] font-semibold text-on-accent disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save supplier"}
        </button>
        <Link
          href={cancelHref}
          className="inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-2.5 text-[12px] font-medium hover:border-accent hover:text-accent"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
