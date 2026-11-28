import { NoBusinessNotice } from "@/components/no-business-notice";
import {
  PageHeader,
  headerActionSecondary,
} from "@/components/page-header";
import { PendingLink } from "@/components/pending-link";
import { CategoryManager } from "@/components/products/category-manager";
import { getActiveBusiness } from "@/lib/businesses";
import { listCategories } from "@/lib/products";
import { getSessionUser } from "@/lib/session";

/**
 * Categories live under Products, not in the rail: the rail stays at ten
 * destinations and `/products/categories` keeps the Products item active via
 * the `pathname.startsWith(href + "/")` rule in `AppNav`.
 */
export default async function CategoriesPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const { active } = await getActiveBusiness(user.id);
  if (!active) return <NoBusinessNotice />;

  const categories = await listCategories(user.id, active.id);
  const canEdit = active.role !== "viewer";

  return (
    <section className="flex max-w-[640px] flex-col gap-4">
      <PageHeader
        title="Categories"
        summary={
          <>
            {categories.length} categor{categories.length === 1 ? "y" : "ies"}{" "}
            · {active.name}
          </>
        }
        actions={
          <PendingLink href="/products" className={headerActionSecondary}>
            Back to products
          </PendingLink>
        }
      />

      <p className="text-[12px] text-ink-muted">
        Used to group the catalogue and filter the products list. A category
        can be renamed at any time; it can only be deleted when no product
        uses it.
      </p>

      <CategoryManager categories={categories} canEdit={canEdit} />

      {!canEdit ? (
        <p className="text-[12px] text-ink-muted">
          You can view categories but not change them.
        </p>
      ) : null}
    </section>
  );
}
