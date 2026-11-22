import {
  FilterBarSkeleton,
  ListHeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/skeletons";

/** Suppliers: one search field beside an archived toggle, four columns. */
export default function SuppliersLoading() {
  return (
    <PageSkeleton label="Loading suppliers">
      <ListHeaderSkeleton titleWidth="w-24" />
      <FilterBarSkeleton fields={1} />
      <TableSkeleton columns={4} minWidth="620px" />
    </PageSkeleton>
  );
}
