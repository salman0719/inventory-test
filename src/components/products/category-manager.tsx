"use client";

import { useActionState, useState } from "react";
import {
  deleteCategoryAction,
  renameCategoryAction,
  type CategoryDeleteState,
  type CategoryRenameState,
} from "@/app/(app)/products/actions";
import type { CategoryOption } from "@/lib/products";
import { CategoryForm } from "./category-form";

const ROW_BUTTON =
  "inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-2.5 text-[12px] font-medium hover:border-accent hover:text-accent disabled:opacity-60";

export function CategoryManager({
  categories,
  canEdit,
}: {
  categories: CategoryOption[];
  canEdit: boolean;
}) {
  return (
    <div className="overflow-hidden rounded border border-line bg-surface">
      {canEdit ? (
        <div className="border-b border-line px-3 py-2.5">
          <CategoryForm />
        </div>
      ) : null}

      {categories.length === 0 ? (
        <p className="px-3 py-4 text-[12px] text-ink-muted">
          No categories yet.
          {canEdit ? " Add the first one above." : ""}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {categories.map((category) => (
            <CategoryRow
              key={`${category.id}|${category.name}`}
              category={category}
              canEdit={canEdit}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CategoryRow({
  category,
  canEdit,
}: {
  category: CategoryOption;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [renameState, renameAction, renamePending] = useActionState<
    CategoryRenameState,
    FormData
  >(renameCategoryAction, {});
  const [deleteState, deleteAction, deletePending] = useActionState<
    CategoryDeleteState,
    FormData
  >(deleteCategoryAction, {});

  // A saved rename revalidates the list, so the row remounts on its new name
  // (see the key above) and editing resets without an effect.

  return (
    <li className="flex flex-col gap-2 px-3 py-2">
      <div className="flex items-center gap-3">
        {editing ? (
          <form action={renameAction} className="flex flex-1 flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={category.id} />
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="sr-only">Category name</span>
              <input
                name="name"
                required
                maxLength={60}
                defaultValue={category.name}
                aria-label={`Rename ${category.name}`}
                className="h-9 w-full min-w-0 rounded border border-line bg-surface px-2 text-[13px]"
              />
            </label>
            <button
              type="submit"
              disabled={renamePending}
              className="inline-flex min-h-[36px] items-center rounded bg-accent px-3 text-[12px] font-semibold text-on-accent disabled:opacity-60"
            >
              {renamePending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className={ROW_BUTTON}
            >
              Cancel
            </button>
          </form>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-[13px]">
              {category.name}
            </span>
            <span className="font-mono text-[11px] text-ink-faint">
              {category.productCount} product
              {category.productCount === 1 ? "" : "s"}
            </span>
            {canEdit ? (
              <>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className={ROW_BUTTON}
                  aria-label={`Rename ${category.name}`}
                >
                  Rename
                </button>
                <form
                  action={deleteAction}
                  onSubmit={(event) => {
                    if (
                      !window.confirm(
                        category.productCount > 0
                          ? `Delete "${category.name}"? It is still used by ${category.productCount} product${category.productCount === 1 ? "" : "s"}, so this will be refused. Move those products first.`
                          : `Delete "${category.name}"? This cannot be undone.`,
                      )
                    ) {
                      event.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="id" value={category.id} />
                  <button
                    type="submit"
                    disabled={deletePending}
                    className={`${ROW_BUTTON} text-danger hover:border-danger`}
                    aria-label={`Delete ${category.name}`}
                  >
                    {deletePending ? "Deleting…" : "Delete"}
                  </button>
                </form>
              </>
            ) : null}
          </>
        )}
      </div>

      {renameState.error ? (
        <p role="alert" className="text-[12px] text-danger">
          {renameState.error}
        </p>
      ) : null}
      {deleteState.error ? (
        <p role="alert" className="text-[12px] text-danger">
          {deleteState.error}
        </p>
      ) : null}
    </li>
  );
}
