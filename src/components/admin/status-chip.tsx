import type { RegistrationStatus } from "@/lib/admin";

/**
 * The one place a registration's state gets a colour, so the queue, the detail panel
 * and the overview cannot disagree about what "pending" looks like.
 */
const TONE: Record<RegistrationStatus, { label: string; className: string }> = {
  pending: {
    label: "Waiting",
    className: "border-warning-soft bg-warning-soft text-warning",
  },
  approved: {
    label: "Approved",
    className: "border-success-soft bg-success-soft text-success",
  },
  rejected: {
    label: "Rejected",
    className: "border-danger-soft bg-danger-soft text-danger",
  },
};

export function StatusChip({ status }: { status: RegistrationStatus }) {
  const tone = TONE[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold tracking-[0.02em] ${tone.className}`}
    >
      {tone.label}
    </span>
  );
}
