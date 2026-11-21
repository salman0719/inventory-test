import { SectionPlaceholder } from "@/components/section-placeholder";

export default function ReportsPage() {
  return (
    <SectionPlaceholder
      title="Reports"
      description="Current stock, low stock, movements and order status."
      emptyTitle="No reports yet"
      emptyBody="Reports and CSV export arrive near the end of Phase 5, once the stock and purchasing data they summarise is real."
      nextHref="/settings"
      nextLabel="Settings"
    />
  );
}
