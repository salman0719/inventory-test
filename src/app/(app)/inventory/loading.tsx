import {
  FilterBarSkeleton,
  ListHeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/skeletons";

/** Inventory: four filter fields, six columns, same table shape as products. */
export default function InventoryLoading() {
  return (
    <PageSkeleton label="Loading inventory">
      <ListHeaderSkeleton titleWidth="w-20" />
      <FilterBarSkeleton fields={4} />
      <TableSkeleton columns={6} minWidth="700px" />
    </PageSkeleton>
  );
}
