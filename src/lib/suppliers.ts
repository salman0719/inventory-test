import { withTenant } from "./db";
import type { SupplierInput } from "./supplier-input";

/**
 * Supplier data access. Same contract as products: the business id comes from the
 * session, every query runs inside `withTenant`, and RLS is the boundary.
 */

export type SupplierSummary = {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  isArchived: boolean;
  productCount: number;
};

/** What a supplier's catalogue looks like from inside its panel. */
export type SuppliedProduct = {
  id: string;
  name: string;
  sku: string;
  onHand: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SELECT_SUPPLIER = `
  select s.id, s.name, s.contact_name, s.email, s.phone, s.address, s.notes,
         s.is_archived, count(p.id)::int as product_count
    from suppliers s
    left join products p
      on p.business_id = s.business_id and p.supplier_id = s.id
     and p.is_archived = false
`;

type Row = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  is_archived: boolean;
  product_count: number;
};

function toSummary(row: Row): SupplierSummary {
  return {
    id: row.id,
    name: row.name,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    notes: row.notes,
    isArchived: row.is_archived,
    productCount: row.product_count,
  };
}

function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, "\\$&")}%`;
}

export async function listSuppliers(
  userId: string,
  businessId: string,
  options: { search?: string; includeArchived?: boolean } = {},
): Promise<SupplierSummary[]> {
  const search = options.search?.trim().slice(0, 80) ?? "";
  const includeArchived = options.includeArchived === true;

  return withTenant(userId, async (client) => {
    const result = await client.query<Row>(
      `${SELECT_SUPPLIER}
        where s.business_id = $1
          and ($2::text is null or s.name ilike $2 or s.contact_name ilike $2
               or s.email ilike $2)
          and ($3::boolean or s.is_archived = false)
        group by s.id
        order by lower(s.name)`,
      [businessId, search === "" ? null : likePattern(search), includeArchived],
    );
    return result.rows.map(toSummary);
  });
}

export async function getSupplier(
  userId: string,
  businessId: string,
  supplierId: string,
): Promise<SupplierSummary | null> {
  if (!UUID_PATTERN.test(supplierId)) return null;

  return withTenant(userId, async (client) => {
    const result = await client.query<Row>(
      `${SELECT_SUPPLIER}
        where s.business_id = $1 and s.id = $2
        group by s.id`,
      [businessId, supplierId],
    );
    const row = result.rows[0];
    return row ? toSummary(row) : null;
  });
}

export async function listSuppliedProducts(
  userId: string,
  businessId: string,
  supplierId: string,
): Promise<SuppliedProduct[]> {
  if (!UUID_PATTERN.test(supplierId)) return [];

  return withTenant(userId, async (client) => {
    const result = await client.query<{
      id: string;
      name: string;
      sku: string;
      on_hand: string;
    }>(
      `select p.id, p.name, p.sku, coalesce(st.on_hand, 0)::text as on_hand
         from products p
         left join product_stock st
           on st.business_id = p.business_id and st.product_id = p.id
        where p.business_id = $1 and p.supplier_id = $2 and p.is_archived = false
        order by lower(p.name)
        limit 25`,
      [businessId, supplierId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      onHand: row.on_hand,
    }));
  });
}

export async function createSupplier(
  userId: string,
  businessId: string,
  input: SupplierInput,
): Promise<string> {
  return withTenant(userId, async (client) => {
    const result = await client.query<{ id: string }>(
      `insert into suppliers
         (business_id, name, contact_name, email, phone, address, notes)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [
        businessId,
        input.name,
        input.contactName,
        input.email,
        input.phone,
        input.address,
        input.notes,
      ],
    );
    return result.rows[0].id;
  });
}

export async function updateSupplier(
  userId: string,
  businessId: string,
  supplierId: string,
  input: SupplierInput,
): Promise<boolean> {
  if (!UUID_PATTERN.test(supplierId)) return false;

  return withTenant(userId, async (client) => {
    const result = await client.query(
      `update suppliers
          set name = $3, contact_name = $4, email = $5, phone = $6,
              address = $7, notes = $8, updated_at = now()
        where business_id = $1 and id = $2`,
      [
        businessId,
        supplierId,
        input.name,
        input.contactName,
        input.email,
        input.phone,
        input.address,
        input.notes,
      ],
    );
    return result.rowCount === 1;
  });
}

export async function setSupplierArchived(
  userId: string,
  businessId: string,
  supplierId: string,
  archived: boolean,
): Promise<boolean> {
  if (!UUID_PATTERN.test(supplierId)) return false;

  return withTenant(userId, async (client) => {
    const result = await client.query(
      `update suppliers set is_archived = $3, updated_at = now()
        where business_id = $1 and id = $2`,
      [businessId, supplierId, archived],
    );
    return result.rowCount === 1;
  });
}
