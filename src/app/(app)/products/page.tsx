import { SectionPlaceholder } from "@/components/section-placeholder";

export default function ProductsPage() {
  return (
    <SectionPlaceholder
      title="Products"
      description="Name, SKU, category, supplier, cost and reorder level."
      emptyTitle="No products shown yet"
      emptyBody="The catalogue, search, filters and archive arrive in the next slice. Until then this page confirms the shell, navigation and business selector."
      nextHref="/inventory"
      nextLabel="Inventory"
    />
  );
}
