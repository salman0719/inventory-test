"use client";

import { useActionState, useState, type ChangeEvent } from "react";
import {
  saveSupplier,
  type SupplierFormState,
} from "@/app/(app)/suppliers/actions";
import { PanelLink } from "@/components/panel-link";
import type { SupplierDefaults } from "@/lib/supplier-defaults";

const INPUT =
  "h-9 w-full rounded border border-line bg-surface px-2 text-[13px]";
const LABEL = "text-[10px] uppercase tracking-[0.07em] text-ink-muted";

function toField(value: string | null): string {
  return value ?? "";
}

type Fields = {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  leadTimeDays: string;
};

function initialFields(defaults: SupplierDefaults): Fields {
  return {
    name: defaults.name,
    contactName: toField(defaults.contactName),
    email: toField(defaults.email),
    phone: toField(defaults.phone),
    address: toField(defaults.address),
    notes: toField(defaults.notes),
    leadTimeDays: defaults.leadTimeDays?.toString() ?? "",
  };
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
  // Controlled, because React resets an uncontrolled form after every action: a
  // rejected save (a name that is too long, a malformed email) would otherwise
  // wipe everything the operator typed. MovementForm documents the same reason.
  const [fields, setFields] = useState<Fields>(() => initialFields(defaults));

  function bind(key: keyof Fields) {
    return {
      name: key,
      value: fields[key],
      onChange: (
        event: ChangeEvent<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >,
      ) => setFields((current) => ({ ...current, [key]: event.target.value })),
    };
  }

  return (
    <form action={formAction} className="flex flex-col gap-2.5">
      <input type="hidden" name="id" value={defaults.id} />

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Business name</span>
        <input {...bind("name")} required maxLength={120} className={INPUT} />
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Contact name</span>
        <input
          {...bind("contactName")}
          maxLength={80}
          placeholder="optional"
          className={INPUT}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Email</span>
        <input
          {...bind("email")}
          type="email"
          maxLength={120}
          placeholder="optional"
          className={INPUT}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Phone</span>
        <input
          {...bind("phone")}
          maxLength={40}
          placeholder="optional"
          className={INPUT}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Lead time (days)</span>
        <input
          {...bind("leadTimeDays")}
          inputMode="numeric"
          maxLength={3}
          placeholder="optional"
          className={`${INPUT} font-mono`}
        />
        <span className="text-[11px] text-ink-faint">
          Calendar days from ordering to delivery. Used to pre-fill the expected
          date on a draft order.
        </span>
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Address</span>
        <textarea
          {...bind("address")}
          rows={2}
          maxLength={200}
          placeholder="optional"
          className="w-full rounded border border-line bg-surface px-2 py-1.5 text-[13px]"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Notes</span>
        <textarea
          {...bind("notes")}
          rows={3}
          maxLength={2000}
          placeholder="delivery days, order cut-off, account terms"
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
        {/* Closes the panel the same way its Close button does: no page render. */}
        <PanelLink
          href={cancelHref}
          className="inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-2.5 text-[12px] font-medium hover:border-accent hover:text-accent"
        >
          Cancel
        </PanelLink>
      </div>
    </form>
  );
}
