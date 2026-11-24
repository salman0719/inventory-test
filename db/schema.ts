import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Approved at Gate C: docs/plans/phase-3-architecture.md and
 * docs/decisions/0007-gate-c-approval.md.
 *
 * Rules encoded here, not in the application:
 * - every business-owned row carries business_id, and parent references are
 *   composite (business_id, parent_id) so a cross-tenant reference is impossible;
 * - stock is never a column: it is the sum of stock_movements deltas (see the
 *   product_stock view added by the RLS migration);
 * - there is at most one open purchase order per supplier.
 *
 * References to auth.users (business_members.user_id, stock_movements.created_by,
 * purchase_receipts.received_by) are added by the RLS migration rather than here,
 * because Drizzle must not try to create or own the auth schema.
 */

export const businesses = pgTable(
  "businesses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    businessType: text("business_type").notNull(),
    currencyCode: text("currency_code").notNull().default("AUD"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "businesses_business_type_check",
      sql`${t.businessType} in ('cafe', 'retail', 'other')`,
    ),
    check(
      "businesses_currency_code_check",
      sql`char_length(${t.currencyCode}) = 3`,
    ),
  ],
);

export const businessMembers = pgTable(
  "business_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("business_members_business_user_key").on(
      t.businessId,
      t.userId,
    ),
    index("business_members_user_idx").on(t.userId),
    check(
      "business_members_role_check",
      sql`${t.role} in ('owner', 'staff', 'viewer')`,
    ),
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Referenced by products' composite foreign key.
    uniqueIndex("categories_business_id_key").on(t.businessId, t.id),
    uniqueIndex("categories_business_name_key").on(
      t.businessId,
      sql`lower(${t.name})`,
    ),
  ],
);

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    notes: text("notes"),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Referenced by products' and purchase_orders' composite foreign keys.
    uniqueIndex("suppliers_business_id_key").on(t.businessId, t.id),
    index("suppliers_business_name_idx").on(t.businessId, t.name),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id"),
    supplierId: uuid("supplier_id"),
    name: text("name").notNull(),
    sku: text("sku").notNull(),
    description: text("description"),
    unitOfMeasure: text("unit_of_measure").notNull().default("ea"),
    costPrice: numeric("cost_price", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    sellingPrice: numeric("selling_price", { precision: 12, scale: 2 }),
    reorderLevel: numeric("reorder_level", { precision: 12, scale: 3 })
      .notNull()
      .default("0"),
    imagePath: text("image_path"),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("products_business_sku_key").on(t.businessId, t.sku),
    uniqueIndex("products_business_id_key").on(t.businessId, t.id),
    index("products_business_archived_name_idx").on(
      t.businessId,
      t.isArchived,
      t.name,
    ),
    index("products_business_supplier_idx").on(t.businessId, t.supplierId),
    check("products_cost_price_check", sql`${t.costPrice} >= 0`),
    check(
      "products_selling_price_check",
      sql`${t.sellingPrice} is null or ${t.sellingPrice} >= 0`,
    ),
    check("products_reorder_level_check", sql`${t.reorderLevel} >= 0`),
    foreignKey({
      name: "products_category_fk",
      columns: [t.businessId, t.categoryId],
      foreignColumns: [categories.businessId, categories.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "products_supplier_fk",
      columns: [t.businessId, t.supplierId],
      foreignColumns: [suppliers.businessId, suppliers.id],
    }).onDelete("restrict"),
  ],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull(),
    movementType: text("movement_type").notNull(),
    quantityDelta: numeric("quantity_delta", {
      precision: 12,
      scale: 3,
    }).notNull(),
    reason: text("reason"),
    referenceType: text("reference_type"),
    referenceId: uuid("reference_id"),
    unitCost: numeric("unit_cost", { precision: 12, scale: 2 }),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("stock_movements_business_product_created_idx").on(
      t.businessId,
      t.productId,
      t.createdAt,
    ),
    check(
      "stock_movements_type_check",
      sql`${t.movementType} in ('opening', 'received', 'stock_in', 'stock_out', 'adjustment')`,
    ),
    check("stock_movements_delta_check", sql`${t.quantityDelta} <> 0`),
    foreignKey({
      name: "stock_movements_product_fk",
      columns: [t.businessId, t.productId],
      foreignColumns: [products.businessId, products.id],
    }),
  ],
);

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id").notNull(),
    orderNumber: text("order_number").notNull(),
    status: text("status").notNull().default("draft"),
    orderedAt: timestamp("ordered_at", { withTimezone: true }),
    expectedDeliveryAt: date("expected_delivery_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("purchase_orders_business_number_key").on(
      t.businessId,
      t.orderNumber,
    ),
    uniqueIndex("purchase_orders_business_id_key").on(t.businessId, t.id),
    // Gate A rule: one open order per supplier, enforced here rather than hoped for.
    uniqueIndex("purchase_orders_one_open_per_supplier")
      .on(t.businessId, t.supplierId)
      .where(sql`${t.status} in ('draft', 'ordered', 'partially_received')`),
    check(
      "purchase_orders_status_check",
      sql`${t.status} in ('draft', 'ordered', 'partially_received', 'received', 'cancelled')`,
    ),
    foreignKey({
      name: "purchase_orders_supplier_fk",
      columns: [t.businessId, t.supplierId],
      foreignColumns: [suppliers.businessId, suppliers.id],
    }),
  ],
);

export const purchaseOrderLines = pgTable(
  "purchase_order_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    purchaseOrderId: uuid("purchase_order_id").notNull(),
    productId: uuid("product_id").notNull(),
    quantityOrdered: numeric("quantity_ordered", {
      precision: 12,
      scale: 3,
    }).notNull(),
    receivedQuantity: numeric("received_quantity", { precision: 12, scale: 3 })
      .notNull()
      .default("0"),
    unitCost: numeric("unit_cost", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("purchase_order_lines_order_product_key").on(
      t.purchaseOrderId,
      t.productId,
    ),
    uniqueIndex("purchase_order_lines_business_id_key").on(t.businessId, t.id),
    check("purchase_order_lines_ordered_check", sql`${t.quantityOrdered} > 0`),
    check(
      "purchase_order_lines_received_check",
      sql`${t.receivedQuantity} >= 0 and ${t.receivedQuantity} <= ${t.quantityOrdered}`,
    ),
    foreignKey({
      name: "purchase_order_lines_order_fk",
      columns: [t.businessId, t.purchaseOrderId],
      foreignColumns: [purchaseOrders.businessId, purchaseOrders.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "purchase_order_lines_product_fk",
      columns: [t.businessId, t.productId],
      foreignColumns: [products.businessId, products.id],
    }),
  ],
);

export const purchaseReceipts = pgTable(
  "purchase_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    purchaseOrderId: uuid("purchase_order_id").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    notes: text("notes"),
    receivedBy: uuid("received_by"),
    idempotencyKey: uuid("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("purchase_receipts_business_idempotency_key").on(
      t.businessId,
      t.idempotencyKey,
    ),
    uniqueIndex("purchase_receipts_business_id_key").on(t.businessId, t.id),
    foreignKey({
      name: "purchase_receipts_order_fk",
      columns: [t.businessId, t.purchaseOrderId],
      foreignColumns: [purchaseOrders.businessId, purchaseOrders.id],
    }),
  ],
);

export const purchaseReceiptLines = pgTable(
  "purchase_receipt_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    receiptId: uuid("receipt_id").notNull(),
    purchaseOrderLineId: uuid("purchase_order_line_id").notNull(),
    quantityReceived: numeric("quantity_received", {
      precision: 12,
      scale: 3,
    }).notNull(),
    unitCost: numeric("unit_cost", { precision: 12, scale: 2 }),
  },
  (t) => [
    check(
      "purchase_receipt_lines_quantity_check",
      sql`${t.quantityReceived} > 0`,
    ),
    foreignKey({
      name: "purchase_receipt_lines_receipt_fk",
      columns: [t.businessId, t.receiptId],
      foreignColumns: [purchaseReceipts.businessId, purchaseReceipts.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "purchase_receipt_lines_order_line_fk",
      columns: [t.businessId, t.purchaseOrderLineId],
      foreignColumns: [purchaseOrderLines.businessId, purchaseOrderLines.id],
    }),
  ],
);

/**
 * Who may review registrations. Deliberately tiny and platform-wide: an admin is
 * not a tenant role, so this table has no business_id and never appears in a
 * business's own screens.
 *
 * References to auth.users are added by the registration migration, for the same
 * reason as business_members: Drizzle must not own the auth schema.
 */
export const platformAdmins = pgTable("platform_admins", {
  userId: uuid("user_id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * A registration waiting for a human. The row is written by the applicant after
 * their address is confirmed, and only a platform admin can move it off `pending`
 * (see `private.approve_signup_request`). No business exists until approval, which
 * is what makes an unapproved account harmless even if it signs in.
 */
export const signupRequests = pgTable(
  "signup_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    businessName: text("business_name").notNull(),
    businessType: text("business_type").notNull(),
    status: text("status").notNull().default("pending"),
    businessId: uuid("business_id").references(() => businesses.id, {
      onDelete: "set null",
    }),
    adminNote: text("admin_note"),
    decidedBy: uuid("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("signup_requests_user_key").on(t.userId),
    index("signup_requests_status_created_idx").on(t.status, t.createdAt),
    check(
      "signup_requests_status_check",
      sql`${t.status} in ('pending', 'approved', 'rejected')`,
    ),
    check(
      "signup_requests_business_type_check",
      sql`${t.businessType} in ('cafe', 'retail', 'other')`,
    ),
  ],
);
