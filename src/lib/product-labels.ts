import type { PoolClient } from "pg";
import { runInTenant } from "./db";

/**
 * Labels for the printable QR sheet.
 *
 * The QR payload is `<origin>/scan/<product uuid>`: the uuid is already opaque and
 * stable, so reprinting a label cannot invalidate the one on the shelf. Nothing
 * mutable — quantity, price, business name — is encoded. The scan route resolves
 * the id through the session and RLS, exactly like the product panel.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Three columns by seven rows of 63.5 × 38.1 mm labels fit A4 with margins. */
export const LABELS_PER_PAGE = 21;
/** A filtered list can span several sheets; this keeps one render bounded. */
export const LABEL_LIMIT = 96;

export type ProductLabel = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  /** The default supplier's own code, when one is recorded. */
  supplierSku: string | null;
};

export type ProductLabelOptions = {
  /** One product for the panel's "Print label" action. */
  productId?: string;
  search?: string;
  categoryId?: string;
  includeArchived?: boolean;
};

export function labelPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / LABELS_PER_PAGE));
}

export function scanPath(productId: string): string {
  return `/scan/${productId}`;
}

export function scanUrl(origin: string, productId: string): string {
  return `${origin.replace(/\/+$/, "")}${scanPath(productId)}`;
}

/** Escape LIKE metacharacters so a search for "50%" is a search, not a wildcard. */
function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, "\\$&")}%`;
}

export async function getProductLabels(
  userId: string,
  businessId: string,
  options: ProductLabelOptions = {},
  client?: PoolClient,
): Promise<{ labels: ProductLabel[]; total: number }> {
  const productId =
    options.productId && UUID_PATTERN.test(options.productId)
      ? options.productId
      : null;
  if (options.productId && productId === null) {
    return { labels: [], total: 0 };
  }
  const search = options.search?.trim().slice(0, 80) ?? "";
  const categoryId =
    options.categoryId && UUID_PATTERN.test(options.categoryId)
      ? options.categoryId
      : null;
  const includeArchived = options.includeArchived === true;

  return runInTenant(userId, client, async (client) => {
    const filters = `
      where p.business_id = $1
        and ($2::uuid is null or p.id = $2)
        and ($3::text is null
             or p.name ilike $3 or p.sku ilike $3 or p.barcode ilike $3)
        and ($4::uuid is null or p.category_id = $4)
        and ($5::boolean or p.is_archived = false)
    `;
    const params = [
      businessId,
      productId,
      search === "" ? null : likePattern(search),
      categoryId,
      includeArchived,
    ];

    const rows = await client.query<{
      id: string;
      name: string;
      sku: string;
      barcode: string | null;
      supplier_sku: string | null;
    }>(
      `select p.id, p.name, p.sku, p.barcode, ps.supplier_sku
         from products p
         left join product_suppliers ps
           on ps.business_id = p.business_id
          and ps.product_id = p.id and ps.is_default
         ${filters}
        order by lower(p.name), p.id
        limit $6`,
      [...params, LABEL_LIMIT],
    );
    const counted = await client.query<{ total: number }>(
      `select count(*)::int as total from products p ${filters}`,
      params,
    );

    return {
      labels: rows.rows.map((row) => ({
        id: row.id,
        name: row.name,
        sku: row.sku,
        barcode: row.barcode,
        supplierSku: row.supplier_sku,
      })),
      total: counted.rows[0]?.total ?? 0,
    };
  });
}
