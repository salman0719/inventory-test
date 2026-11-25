"use client";

import { useActionState, useState } from "react";
import {
  saveStocktakeAction,
  type StocktakeFormState,
} from "@/app/(app)/stocktake/actions";
import { formatQuantity } from "@/lib/product-input";

const TH =
  "px-2.5 py-1.5 text-left text-[10px] font-medium uppercase tracking-[0.07em] text-ink-muted";
const TD = "px-2.5 py-1.5 align-middle";
const INPUT =
  "h-8 w-24 rounded border border-line bg-surface px-1.5 text-right font-mono text-[12px]";

export type CountLine = {
  id: string;
  productName: string;
  sku: string;
  unitOfMeasure: string;
  expectedQuantity: string;
  countedQuantity: string | null;
};

/**
 * The count sheet. A blank box is "not counted yet"; completing posts one ledger
 * adjustment per entered product, from the live on-hand figure rather than the
 * snapshot beside it. Both buttons submit the same transaction, so the sheet that
 * is completed is exactly the one on screen.
 */
export function CountForm({
  sessionId,
  reference,
  lines,
}: {
  sessionId: string;
  reference: string;
  lines: CountLine[];
}) {
  const [state, formAction, pending] = useActionState<
    StocktakeFormState,
    FormData
  >(saveStocktakeAction, {});
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      lines.map((line) => [line.id, line.countedQuantity ?? ""]),
    ),
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="sessionId" value={sessionId} />

      <div className="overflow-x-auto rounded border border-line">
        <table className="w-full min-w-[520px] border-collapse">
          <thead className="bg-panel">
            <tr>
              <th className={TH}>Product</th>
              <th className={`${TH} text-right`}>On hand at start</th>
              <th className={`${TH} text-right`}>Counted</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-t border-line">
                <td className={TD}>
                  <input type="hidden" name="lineId" value={line.id} />
                  <span className="block text-[12.5px]">
                    {line.productName}
                  </span>
                  <span className="block font-mono text-[10.5px] text-ink-faint">
                    {line.sku}
                  </span>
                </td>
                <td className={`${TD} text-right font-mono text-[12px]`}>
                  {formatQuantity(line.expectedQuantity)}{" "}
                  <span className="text-[10.5px] text-ink-faint">
                    {line.unitOfMeasure}
                  </span>
                </td>
                <td className={`${TD} text-right`}>
                  <input
                    name={`count:${line.id}`}
                    inputMode="decimal"
                    aria-label={`Counted quantity for ${line.productName}`}
                    value={counts[line.id] ?? ""}
                    onChange={(event) =>
                      setCounts((current) => ({
                        ...current,
                        [line.id]: event.target.value,
                      }))
                    }
                    placeholder="—"
                    className={INPUT}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-ink-muted">
        Leave a product blank to skip it. Completing adjusts every entered
        product to its count; a count that matches the ledger writes nothing.
      </p>

      {state.error ? (
        <p
          role="alert"
          className="rounded border border-line bg-danger-soft px-2.5 py-2 text-[12px] text-danger"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="intent"
          value="save"
          disabled={pending}
          className="inline-flex min-h-[36px] items-center justify-center rounded border border-line bg-surface px-3 text-[12px] font-medium hover:border-accent hover:text-accent disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save counts"}
        </button>
        <button
          type="submit"
          name="intent"
          value="complete"
          disabled={pending}
          onClick={(event) => {
            if (
              !window.confirm(
                `Complete ${reference} and adjust the ledger to these counts?`,
              )
            ) {
              event.preventDefault();
            }
          }}
          className="inline-flex min-h-[36px] items-center justify-center rounded bg-accent px-3 text-[12px] font-semibold text-on-accent disabled:opacity-60"
        >
          Complete stocktake
        </button>
      </div>
    </form>
  );
}
