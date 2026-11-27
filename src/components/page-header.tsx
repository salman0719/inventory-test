import type { ReactNode } from "react";

/**
 * One header for every screen: a title block and an actions slot.
 *
 * Products used to put four actions in a bare right-aligned row with no wrapping
 * rule, so two labels broke onto a second line at 320 px; Suppliers pushed Import
 * right but left the primary action to fall under it on the left. Both now hand
 * the same slot the same list, in visual order with the primary action last, so
 * every screen starts its content at the same place.
 *
 * Below 400 px an action is half the row, so four become a 2 × 2 grid, two stay on
 * one row and a single action fills the row. From 400 px up the slot sits at the
 * right of the title.
 */
export function PageHeader({
  eyebrow,
  title,
  summary,
  actions,
}: {
  /**
   * Only where the screen really sits under a parent section — Dashboard and
   * Reports. It is one line, and every other screen skips it.
   */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** The count and the business, on the title's line and wrapping under it. */
  summary?: ReactNode;
  /** In visual order, primary action last. */
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="min-w-0 flex-1 basis-[15rem]">
        {eyebrow ? (
          <p className="text-[10px] uppercase tracking-[0.08em] text-ink-muted">
            {eyebrow}
          </p>
        ) : null}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h1 className="text-[15px] font-semibold tracking-tight">{title}</h1>
          {summary ? (
            <p className="text-[12px] text-ink-muted">{summary}</p>
          ) : null}
        </div>
      </div>

      {actions ? (
        <div className="flex flex-wrap items-center gap-2 max-[399px]:w-full min-[400px]:ml-auto">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

/**
 * A header action. The label never breaks: at 320 px the old buttons wrapped
 * "Print labels" onto two lines and left the row with uneven heights. Below
 * 400 px each action takes half the row, and the last one grows, so a lone
 * action is a full-width button rather than half an empty row.
 */
const ACTION =
  "inline-flex min-h-[36px] items-center justify-center whitespace-nowrap rounded px-3 text-[12px] font-medium max-[399px]:basis-[calc(50%_-_0.25rem)] max-[399px]:last:grow";

export const headerActionSecondary = `${ACTION} border border-line bg-surface hover:border-accent hover:text-accent`;

export const headerActionPrimary = `${ACTION} bg-accent font-semibold text-on-accent`;
