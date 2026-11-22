import {
  FilterBarSkeleton,
  ListHeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/skeletons";

/**
 * The products list has four filter fields and six columns, so its skeleton is the
 * same shape: the header, the bar and the table, in the same place. The generic
 * group fallback looked like the dashboard on every route, which read as a reset
 * rather than a page on its way.
 */
export default function ProductsLoading() {
  return (
    <PageSkeleton label="Loading products">
      <ListHeaderSkeleton titleWidth="w-20" />
      <FilterBarSkeleton fields={3} />
      <TableSkeleton columns={6} minWidth="680px" />
    </PageSkeleton>
  );
}
