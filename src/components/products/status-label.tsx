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

/** The same dot and word in a tinted pill, for the phone's cards. */
const CHIPS: Record<StockStatus, string> = {
  ok: "bg-success-soft text-success",
  low: "bg-warning-soft text-warning",
  out: "bg-danger-soft text-danger",
};

export function StatusChip({ status }: { status: StockStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-medium whitespace-nowrap ${CHIPS[status]}`}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
      />
      <span>{WORDS[status]}</span>
    </span>
  );
}
