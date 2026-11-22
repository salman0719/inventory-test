import type { StockStatus } from "@/lib/product-input";

/**
 * Status is a dot plus a word, never colour alone (0006). The word is the label a
 * screen reader and a colour-blind operator both read.
 */
const TONES: Record<StockStatus, string> = {
  ok: "bg-success",
  low: "bg-warning",
  out: "bg-danger",
};

const WORDS: Record<StockStatus, string> = {
  ok: "ok",
  low: "low",
  out: "out",
};

export function StatusLabel({ status }: { status: StockStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONES[status]}`}
      />
      <span>{WORDS[status]}</span>
    </span>
  );
}
