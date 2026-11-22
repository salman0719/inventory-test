import {
  FilterBarSkeleton,
  ListHeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/skeletons";

/** Purchase orders: search and status, six columns, the widest of the lists. */
export default function PurchaseOrdersLoading() {
  return (
    <PageSkeleton label="Loading purchase orders">
      <ListHeaderSkeleton titleWidth="w-32" />
      <FilterBarSkeleton fields={2} />
      <TableSkeleton columns={6} minWidth="760px" />
    </PageSkeleton>
  );
}
