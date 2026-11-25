"use client";

import { useActionState, useState } from "react";
import {
  startStocktakeAction,
  type StocktakeFormState,
} from "@/app/(app)/stocktake/actions";
import type { CategoryOption } from "@/lib/products";

const INPUT =
  "h-9 w-full rounded border border-line bg-surface px-2 text-[13px]";
const LABEL = "text-[10px] uppercase tracking-[0.07em] text-ink-muted";

/**
 * Start a sheet. The filters are stored with the session and decide which products
 * get a line; every active product is counted when both are empty.
 */
export function StartStocktakeForm({
  categories,
}: {
  categories: CategoryOption[];
}) {
  const [state, formAction, pending] = useActionState<
    StocktakeFormState,
    FormData
  >(startStocktakeAction, {});
  // Held in state so a rejected scope keeps what was typed, not a reset form.
  const [categoryId, setCategoryId] = useState("");
  const [search, setSearch] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-2.5">
      <div className="grid gap-2 sm:grid-cols-[200px_minmax(0,1fr)]">
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Category</span>
          <select
            name="categoryId"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className={INPUT}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className={LABEL}>Name or SKU contains</span>
          <input
            name="search"
            maxLength={80}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Leave empty to count everything"
            className={INPUT}
          />
        </label>
      </div>

      <p className="text-[11px] text-ink-muted">
        The sheet snapshots what is on hand now. Products added to the catalogue
        after it opens are not part of this count.
      </p>

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
        className="inline-flex min-h-[36px] items-center justify-center rounded bg-accent px-3 text-[12px] font-semibold text-on-accent disabled:opacity-60 sm:w-fit"
      >
        {pending ? "Opening sheet…" : "Start counting"}
      </button>
    </form>
  );
}
