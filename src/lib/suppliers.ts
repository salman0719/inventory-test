import type { PoolClient } from "pg";
import { recordActivity } from "./activity";
import { runInTenant, withTenant } from "./db";
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
  leadTimeDays: number | null;
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
         s.lead_time_days, s.is_archived, count(p.id)::int as product_count
    from suppliers s
    left join product_suppliers ps
      on ps.business_id = s.business_id and ps.supplier_id = s.id
    left join products p
      on p.business_id = ps.business_id and p.id = ps.product_id
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
  lead_time_days: number | null;
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
    leadTimeDays: row.lead_time_days,
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

/**
 * Everything the supplier panel reads, on one connection: the supplier and, for a
 * detail view, the products they supply.
 */
export async function getSupplierPanel(
  userId: string,
  businessId: string,
  request: { mode: "create" | "edit" | "detail"; supplierId: string },
): Promise<{ supplier: SupplierSummary | null; products: SuppliedProduct[] }> {
  return withTenant(userId, async (client) => {
    const supplier =
      request.mode === "create" || request.supplierId === ""
        ? null
        : await getSupplier(userId, businessId, request.supplierId, client);
    const products =
      supplier !== null && request.mode === "detail"
        ? await listSuppliedProducts(userId, businessId, supplier.id, client)
        : [];
    return { supplier, products };
  });
}

export async function getSupplier(
  userId: string,
  businessId: string,
  supplierId: string,
  client?: PoolClient,
): Promise<SupplierSummary | null> {
  if (!UUID_PATTERN.test(supplierId)) return null;

  return runInTenant(userId, client, async (client) => {
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
  client?: PoolClient,
): Promise<SuppliedProduct[]> {
  if (!UUID_PATTERN.test(supplierId)) return [];

  return runInTenant(userId, client, async (client) => {
    const result = await client.query<{
      id: string;
      name: string;
      sku: string;
      on_hand: string;
    }>(
      `select p.id, p.name, p.sku,
              coalesce(st.on_hand, 0)::text as on_hand
         from products p
         join product_suppliers ps
           on ps.business_id = p.business_id and ps.product_id = p.id
          and ps.supplier_id = $2
         left join product_stock st
           on st.business_id = p.business_id and st.product_id = p.id
        where p.business_id = $1 and p.is_archived = false
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
         (business_id, name, contact_name, email, phone, address, notes,
          lead_time_days)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id`,
      [
        businessId,
        input.name,
        input.contactName,
        input.email,
        input.phone,
        input.address,
        input.notes,
        input.leadTimeDays,
      ],
    );
    const id = result.rows[0].id;

    await recordActivity(client, {
      actorUserId: userId,
      businessId,
      action: "supplier.created",
      entityType: "supplier",
      entityId: id,
      summary: `Added supplier ${input.name}`,
    });
    return id;
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
              address = $7, notes = $8, lead_time_days = $9, updated_at = now()
        where business_id = $1 and id = $2
        returning id`,
      [
        businessId,
        supplierId,
        input.name,
        input.contactName,
        input.email,
        input.phone,
        input.address,
        input.notes,
        input.leadTimeDays,
      ],
    );
    if (result.rowCount !== 1) return false;

    await recordActivity(client, {
      actorUserId: userId,
      businessId,
      action: "supplier.updated",
      entityType: "supplier",
      entityId: supplierId,
      summary: `Updated supplier ${input.name}`,
    });
    return true;
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
    const result = await client.query<{ name: string }>(
      `update suppliers set is_archived = $3, updated_at = now()
        where business_id = $1 and id = $2
        returning name`,
      [businessId, supplierId, archived],
    );
    const name = result.rows[0]?.name;
    if (name === undefined) return false;

    await recordActivity(client, {
      actorUserId: userId,
      businessId,
      action: archived ? "supplier.archived" : "supplier.restored",
      entityType: "supplier",
      entityId: supplierId,
      summary: `${archived ? "Archived" : "Restored"} supplier ${name}`,
    });
    return true;
  });
}
