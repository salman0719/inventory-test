"use client";

import { useActionState, useState } from "react";
import { resetDemoAction, type ResetState } from "@/app/(app)/settings/actions";
import type { DemoCounts } from "@/lib/demo";

const INITIAL: ResetState = { status: "idle" };

/**
 * The demo reset control.
 *
 * It is intentionally not a one-click button: the action deletes this business's
 * products, suppliers, orders, receipts and ledger, then rebuilds the seeded
 * baseline. Typing RESET is the only confirmation the screen offers, so the input
 * has to match before the button becomes usable.
 */
export function ResetDemoPanel({
  counts,
  businessName,
}: {
  counts: DemoCounts;
  businessName: string;
}) {
  const [state, action, pending] = useActionState(resetDemoAction, INITIAL);
  const [confirm, setConfirm] = useState("");
  const ready = confirm.trim().toUpperCase() === "RESET" && !pending;

  return (
    <section
      aria-labelledby="demo-reset-heading"
      className="max-w-[560px] rounded border border-line bg-surface"
    >
      <header className="border-b border-line px-3 py-2">
        <h2 id="demo-reset-heading" className="text-[13px] font-semibold">
          Demo data
        </h2>
        <p className="text-[11px] text-ink-muted">
          Restore {businessName} to the seeded demonstration dataset.
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-2 px-3 py-2.5 min-[600px]:grid-cols-3">
        <Figure label="Products" value={counts.products} />
        <Figure label="Categories" value={counts.categories} />
        <Figure label="Suppliers" value={counts.suppliers} />
        <Figure label="Orders" value={counts.orders} />
        <Figure label="Movements" value={counts.movements} />
        <Figure label="Receipts" value={counts.receipts} />
      </dl>

      <form action={action} className="border-t border-line px-3 py-3">
        <div className="rounded border border-warning/40 bg-warning-soft px-2.5 py-2">
          <p className="text-[12px] font-medium text-warning">
            This replaces everything this business holds
          </p>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            Products, categories, suppliers, purchase orders, receipts and the
            whole stock ledger are deleted and rebuilt from the demo catalogue.
            Other businesses and signed-in accounts are not touched.
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
              Type RESET to confirm
            </span>
            <input
              name="confirm"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="h-9 w-[140px] rounded border border-line bg-surface px-2.5 font-mono text-[13px] tracking-[0.1em]"
            />
          </label>

          <button
            type="submit"
            disabled={!ready}
            className="min-h-[36px] rounded bg-danger px-3 text-[12px] font-semibold text-on-accent disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-faint"
          >
            {pending ? "Restoring…" : "Reset demo data"}
          </button>
        </div>

        {state.status === "error" ? (
          <p
            role="alert"
            className="mt-2 rounded border border-danger/40 bg-danger-soft px-2.5 py-1.5 text-[12px] text-danger"
          >
            {state.message}
          </p>
        ) : null}

        {state.status === "done" ? (
          <p
            role="status"
            className="mt-2 rounded border border-success/40 bg-success-soft px-2.5 py-1.5 text-[12px] text-success"
          >
            {state.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
        {label}
      </dt>
      <dd className="font-mono text-[15px]">{value}</dd>
    </div>
  );
}
