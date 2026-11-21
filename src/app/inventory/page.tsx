import { SectionPlaceholder } from "@/components/section-placeholder";

export default function InventoryPage() {
  return (
    <SectionPlaceholder
      title="Inventory"
      description="On-hand quantities, low and out states, movements."
      emptyTitle="No stock shown yet"
      emptyBody="On-hand stock, stock in and out, adjustments with a reason, and movement history arrive with the ledger slice."
      nextHref="/suppliers"
      nextLabel="Suppliers"
    />
  );
}
