import { SectionPlaceholder } from "@/components/section-placeholder";

export default function PurchaseOrdersPage() {
  return (
    <SectionPlaceholder
      title="Purchase orders"
      description="One open order per supplier, received in full or in part."
      emptyTitle="No orders shown yet"
      emptyBody="Drafting an order, its lines and transactional receiving arrive after the ledger, because receipts write stock movements."
      nextHref="/reports"
      nextLabel="Reports"
    />
  );
}
