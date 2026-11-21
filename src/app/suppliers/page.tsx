import { SectionPlaceholder } from "@/components/section-placeholder";

export default function SuppliersPage() {
  return (
    <SectionPlaceholder
      title="Suppliers"
      description="Contacts, products supplied and order history."
      emptyTitle="No suppliers shown yet"
      emptyBody="Supplier records, archive and their purchase order history arrive after the products slice."
      nextHref="/purchase-orders"
      nextLabel="Purchase orders"
    />
  );
}
