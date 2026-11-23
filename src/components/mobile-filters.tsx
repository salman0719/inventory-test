"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { FilterSearch } from "./filter-search";
import { PendingLink } from "./pending-link";
import { TransitionBusy, useResultsRegion } from "./results-busy";
import { useModalSheet } from "./use-modal-sheet";

export type FilterChip = {
  /** Shown on the chip, e.g. "Category: Produce". */
  label: string;
  /** The current view without this filter. */
  href: string;
};

const MOTION =
  "ease-[cubic-bezier(0.25,0.1,0.25,1)] motion-reduce:transition-none";

/**
 * The phone's filter bar: search keeps its own row, category, sort and the rest
 * open in a sheet, and every filter that is on is a chip that removes itself in
 * one tap. From 600px up the caller keeps the inline bar instead.
 *
 * The sheet lives inside the form it submits, so the fields, the Apply button and
 * the search term all travel in one `FormData` — but that also means the content
 * column cannot be made `inert` while it is open, because the sheet is one of its
 * descendants. `aria-modal`, the Tab trap and the scroll lock carry the modal
 * behaviour here; the More sheet, rendered outside the column, also goes inert.
 */
export function MobileFilters({
  action,
  clearHref = action,
  filtered,
  q,
  searchLabel,
  searchPlaceholder,
  chips,
  children,
}: {
  action: string;
  clearHref?: string;
  /** Any filter is on, including the search term. */
  filtered: boolean;
  q: string;
  searchLabel: string;
  searchPlaceholder: string;
  chips: FilterChip[];
  /** The fields the sheet holds; the same markup the desktop bar renders. */
  children?: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const inResultsRegion = useResultsRegion();
  const { sheetRef, onKeyDown } = useModalSheet(open, close, {
    inertPage: false,
  });

  // Focus goes back to the button that opened the sheet, after the hook's effect
  // has lifted the scroll lock. It is declared here, after the hook, so that
  // cleanup runs first.
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (wasOpen.current) buttonRef.current?.focus();
  }, [open]);

  function close() {
    setOpen(false);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const search = new URLSearchParams();
    new FormData(event.currentTarget).forEach((value, key) => {
      if (typeof value === "string" && value !== "") search.set(key, value);
    });
    const query = search.toString();
    // The sheet closes first, so the rows it changed are on screen as they arrive.
    setOpen(false);
    startTransition(() => {
      router.push(query === "" ? action : `${action}?${query}`, {
        scroll: false,
      });
    });
  }

  return (
    <form
      method="get"
      action={action}
      aria-busy={pending}
      onSubmit={onSubmit}
      className="flex flex-col gap-2 min-[600px]:hidden"
    >
      <TransitionBusy id="filters-phone" pending={pending} />

      <div className="flex items-center gap-2">
        <FilterSearch
          value={q}
          placeholder={searchPlaceholder}
          label={searchLabel}
          className="h-11 min-w-0 flex-1 rounded border border-line bg-surface px-2.5 text-[13px]"
        />
        <button
          ref={buttonRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded border border-line bg-surface px-3 text-[12.5px] font-medium"
        >
          Filters
          {chips.length > 0 ? (
            <span className="inline-flex min-w-[18px] justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-[16px] text-on-accent">
              {chips.length}
            </span>
          ) : null}
        </button>
      </div>

      {chips.length > 0 ? (
        <ul aria-label="Active filters" className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <li key={chip.label}>
              <PendingLink
                href={chip.href}
                aria-label={`Remove ${chip.label} filter`}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-line bg-accent-soft pl-2.5 pr-1 text-[11.5px] font-medium text-accent"
              >
                {chip.label}
                <span
                  aria-hidden
                  className="inline-flex min-h-[28px] min-w-[28px] items-center justify-center text-[14px] leading-none"
                >
                  ×
                </span>
              </PendingLink>
            </li>
          ))}
        </ul>
      ) : null}

      <div
        inert={!open}
        aria-hidden={!open}
        className="pointer-events-none fixed inset-0 z-50 overflow-clip min-[600px]:hidden"
      >
        <button
          type="button"
          aria-label="Close filters"
          onClick={close}
          className={`absolute inset-0 bg-scrim transition-opacity duration-[180ms] ${MOTION} ${
            open ? "pointer-events-auto opacity-100" : "opacity-0"
          }`}
        />
        <div
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-label="Filters"
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className={`absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-2xl border-t border-line bg-surface shadow-lg outline-none transition-transform duration-[220ms] ${MOTION} ${
            open ? "pointer-events-auto translate-y-0" : "translate-y-[105%]"
          }`}
        >
          <div
            aria-hidden
            className="mx-auto mt-2 h-1 w-9 rounded-full bg-line"
          />
          <div className="flex items-center gap-3 px-3 pt-2 pb-1">
            <h2 className="text-[14px] font-semibold">Filters</h2>
            <button
              type="button"
              onClick={close}
              className="ml-auto min-h-[36px] rounded border border-line px-2.5 text-[12px] font-medium"
            >
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-3">
            {children}
          </div>
          <div className="flex gap-2 border-t border-line px-3 pt-2 pb-[calc(12px_+_env(safe-area-inset-bottom))]">
            {filtered ? (
              <PendingLink
                href={clearHref}
                onClick={close}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded border border-line bg-surface px-3 text-[12px] font-medium"
              >
                Clear
              </PendingLink>
            ) : null}
            <button
              type="submit"
              disabled={pending}
              className={`min-h-[44px] rounded bg-accent px-3 text-[12px] font-semibold text-on-accent disabled:opacity-60 ${
                filtered ? "flex-[2]" : "flex-1"
              }`}
            >
              {pending ? "Applying…" : "Apply filters"}
            </button>
          </div>
        </div>
      </div>

      {inResultsRegion ? null : (
        <span role="status" className="sr-only">
          {pending ? "Updating results" : ""}
        </span>
      )}
    </form>
  );
}
