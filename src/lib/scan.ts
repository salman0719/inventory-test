import { withTenant } from "./db";
import { normalizeScanInput } from "./scan-code";

/**
 * Resolve a scanned code inside one business.
 *
 * The string is never trusted as an access decision: the lookup runs as the
 * signed-in user, with RLS and an explicit business filter. A QR carries a product
 * id; a manufacturer barcode or typed SKU is matched exactly. A barcode is not
 * unique (a case and a unit can share one), so several matches return a chooser
 * instead of guessing.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ScanProduct = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  isArchived: boolean;
};

export type ScanResult =
  | { kind: "one"; product: ScanProduct }
  | { kind: "many"; products: ScanProduct[] }
  | { kind: "none"; code: string };

export async function resolveScan(
  userId: string,
  businessId: string,
  raw: string,
): Promise<ScanResult> {
  const code = normalizeScanInput(raw).slice(0, 200);
  if (code === "") return { kind: "none", code };

  return withTenant(userId, async (client) => {
    const result = await client.query<{
      id: string;
      name: string;
      sku: string;
      barcode: string | null;
      is_archived: boolean;
    }>(
      `select p.id, p.name, p.sku, p.barcode, p.is_archived
         from products p
        where p.business_id = $1
          and (
            ($2::uuid is not null and p.id = $2)
            or p.barcode = $3
            or upper(p.sku) = upper($3)
          )
        order by p.is_archived, lower(p.name), p.id
        limit 20`,
      [businessId, UUID_PATTERN.test(code) ? code : null, code],
    );

    const products = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      barcode: row.barcode,
      isArchived: row.is_archived,
    }));

    if (products.length === 0) return { kind: "none" as const, code };
    if (products.length === 1) {
      return { kind: "one" as const, product: products[0] };
    }
    return { kind: "many" as const, products };
  });
}
