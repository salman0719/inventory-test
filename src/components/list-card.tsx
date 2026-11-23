import type { ReactNode } from "react";
import { PanelLink } from "./panel-link";

/**
 * One record as a card, for the phone.
 *
 * Direction C's table is the desktop list. Below 600px its columns are 60–300px
 * outside the viewport, so the phone gets a card per record instead: the whole
 * card is the link, the record's identity sits above, its status where the eye
 * lands, and every figure the table's columns carry is visible without a gesture.
 *
 * The shape is the one chosen in `local/prototypes/mobile/lists`: title block,
 * tinted status chip, one row of labelled figures.
 */
export function ListCard({
  href,
  title,
  meta,
  badge,
  figures,
}: {
  href: string;
  title: ReactNode;
  /** The identifying second line: SKU and category, contact, supplier and date. */
  meta?: ReactNode;
  /** The status chip, at the right of the title block. */
  badge?: ReactNode;
  figures: { label: string; value: ReactNode }[];
}) {
  return (
    <PanelLink
      href={href}
      className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-3 active:bg-panel data-[panel-active=true]:border-accent data-[panel-active=true]:bg-accent-soft"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <div className="text-[13.5px] leading-tight font-semibold">
            {title}
          </div>
          {meta ? (
            <div className="mt-0.5 truncate text-[10.5px] text-ink-faint">
              {meta}
            </div>
          ) : null}
        </div>
        {badge ? <div className="ml-auto shrink-0 pl-1">{badge}</div> : null}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-muted">
        {figures.map((figure) => (
          <span key={figure.label}>
            {figure.label}{" "}
            <b className="font-mono text-[12.5px] font-medium text-ink">
              {figure.value}
            </b>
          </span>
        ))}
      </div>
    </PanelLink>
  );
}
