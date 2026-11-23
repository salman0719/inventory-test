import type { ReactNode } from "react";

/**
 * One record's frame: a pinned head, a body that scrolls, and a pinned footer of
 * actions. On a phone the sheet is up to 86% of the screen, so the identity and
 * the buttons stay where a thumb can reach them while the details move.
 *
 * From 900px it is the same block it has always been in the right-hand column:
 * the head, the values and the actions in one flow.
 */
export function PanelFrame({
  label,
  header,
  footer,
  children,
}: {
  /** The panel's accessible name, e.g. "Product details". */
  label: string;
  /** Title, subtitle and Close; the frame pins it. */
  header: ReactNode;
  /** Actions; pinned to the bottom edge, above the home indicator. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <aside
      aria-label={label}
      className="flex min-h-0 flex-1 flex-col rounded border border-line bg-surface max-[899px]:rounded-none max-[899px]:border-0 min-[900px]:block"
    >
      <header className="flex flex-none items-start gap-2 border-b border-line px-3 py-2">
        {header}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto min-[900px]:overflow-visible">
        {children}
      </div>
      {footer ? (
        <div className="flex flex-none flex-wrap items-center gap-2 border-t border-line px-3 pt-2 pb-[calc(8px_+_env(safe-area-inset-bottom))] min-[900px]:pb-2">
          {footer}
        </div>
      ) : null}
    </aside>
  );
}
