-- Gate C tenant isolation: docs/plans/phase-3-architecture.md §4.
--
-- Two things this migration deliberately does not do:
-- * it does not create the auth schema or its users — Supabase owns those, and
--   development supplies a shim (db/dev/0001-auth-shim.sql);
-- * it does not grant writes to the stock ledger or receipts. Receiving and
--   adjustments will go through SECURITY DEFINER functions in Phase 5; until
--   then those tables are read-only for application roles.

-- 1. References into auth.users, kept out of the Drizzle schema so Drizzle never
--    tries to own the auth schema.
ALTER TABLE "business_members"
  ADD CONSTRAINT "business_members_user_fk"
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_created_by_fk"
  FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "purchase_receipts"
  ADD CONSTRAINT "purchase_receipts_received_by_fk"
  FOREIGN KEY ("received_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;--> statement-breakpoint

-- 2. Membership helpers. SECURITY DEFINER and owned by the migration role, which
--    owns these tables, so the lookup bypasses RLS and cannot recurse through the
--    business_members policies. search_path is pinned.
CREATE SCHEMA IF NOT EXISTS "private";--> statement-breakpoint
CREATE OR REPLACE FUNCTION "private"."is_member"(b uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM business_members m
    WHERE m.business_id = b AND m.user_id = auth.uid()
  );
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "private"."has_role"(b uuid, roles text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM business_members m
    WHERE m.business_id = b AND m.user_id = auth.uid() AND m.role = ANY (roles)
  );
$$;--> statement-breakpoint
COMMENT ON FUNCTION "private"."is_member"(uuid)
  IS 'RLS helper: true when auth.uid() is a member of the business.';--> statement-breakpoint
COMMENT ON FUNCTION "private"."has_role"(uuid, text[])
  IS 'RLS helper: true when auth.uid() holds one of the roles in the business.';--> statement-breakpoint

-- 3. Row level security on every business-owned table. Default is deny: a table
--    with RLS enabled and no matching policy returns nothing.
ALTER TABLE "businesses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "business_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchase_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- 4. Policies.
CREATE POLICY "businesses_select" ON "businesses" FOR SELECT TO "authenticated"
  USING (private.is_member(id));--> statement-breakpoint
CREATE POLICY "businesses_update" ON "businesses" FOR UPDATE TO "authenticated"
  USING (private.has_role(id, ARRAY['owner']))
  WITH CHECK (private.has_role(id, ARRAY['owner']));--> statement-breakpoint

CREATE POLICY "business_members_select" ON "business_members" FOR SELECT TO "authenticated"
  USING (private.is_member(business_id));--> statement-breakpoint
CREATE POLICY "business_members_insert" ON "business_members" FOR INSERT TO "authenticated"
  WITH CHECK (private.has_role(business_id, ARRAY['owner']));--> statement-breakpoint
CREATE POLICY "business_members_update" ON "business_members" FOR UPDATE TO "authenticated"
  USING (private.has_role(business_id, ARRAY['owner']))
  WITH CHECK (private.has_role(business_id, ARRAY['owner']));--> statement-breakpoint
CREATE POLICY "business_members_delete" ON "business_members" FOR DELETE TO "authenticated"
  USING (private.has_role(business_id, ARRAY['owner']));--> statement-breakpoint

CREATE POLICY "categories_select" ON "categories" FOR SELECT TO "authenticated"
  USING (private.is_member(business_id));--> statement-breakpoint
CREATE POLICY "categories_insert" ON "categories" FOR INSERT TO "authenticated"
  WITH CHECK (private.has_role(business_id, ARRAY['owner', 'staff']));--> statement-breakpoint
CREATE POLICY "categories_update" ON "categories" FOR UPDATE TO "authenticated"
  USING (private.has_role(business_id, ARRAY['owner', 'staff']))
  WITH CHECK (private.has_role(business_id, ARRAY['owner', 'staff']));--> statement-breakpoint

CREATE POLICY "suppliers_select" ON "suppliers" FOR SELECT TO "authenticated"
  USING (private.is_member(business_id));--> statement-breakpoint
CREATE POLICY "suppliers_insert" ON "suppliers" FOR INSERT TO "authenticated"
  WITH CHECK (private.has_role(business_id, ARRAY['owner', 'staff']));--> statement-breakpoint
CREATE POLICY "suppliers_update" ON "suppliers" FOR UPDATE TO "authenticated"
  USING (private.has_role(business_id, ARRAY['owner', 'staff']))
  WITH CHECK (private.has_role(business_id, ARRAY['owner', 'staff']));--> statement-breakpoint

CREATE POLICY "products_select" ON "products" FOR SELECT TO "authenticated"
  USING (private.is_member(business_id));--> statement-breakpoint
CREATE POLICY "products_insert" ON "products" FOR INSERT TO "authenticated"
  WITH CHECK (private.has_role(business_id, ARRAY['owner', 'staff']));--> statement-breakpoint
CREATE POLICY "products_update" ON "products" FOR UPDATE TO "authenticated"
  USING (private.has_role(business_id, ARRAY['owner', 'staff']))
  WITH CHECK (private.has_role(business_id, ARRAY['owner', 'staff']));--> statement-breakpoint

CREATE POLICY "purchase_orders_select" ON "purchase_orders" FOR SELECT TO "authenticated"
  USING (private.is_member(business_id));--> statement-breakpoint
CREATE POLICY "purchase_orders_insert" ON "purchase_orders" FOR INSERT TO "authenticated"
  WITH CHECK (private.has_role(business_id, ARRAY['owner', 'staff']));--> statement-breakpoint
CREATE POLICY "purchase_orders_update" ON "purchase_orders" FOR UPDATE TO "authenticated"
  USING (private.has_role(business_id, ARRAY['owner', 'staff']))
  WITH CHECK (private.has_role(business_id, ARRAY['owner', 'staff']));--> statement-breakpoint

CREATE POLICY "purchase_order_lines_select" ON "purchase_order_lines" FOR SELECT TO "authenticated"
  USING (private.is_member(business_id));--> statement-breakpoint
CREATE POLICY "purchase_order_lines_insert" ON "purchase_order_lines" FOR INSERT TO "authenticated"
  WITH CHECK (private.has_role(business_id, ARRAY['owner', 'staff']));--> statement-breakpoint
CREATE POLICY "purchase_order_lines_update" ON "purchase_order_lines" FOR UPDATE TO "authenticated"
  USING (private.has_role(business_id, ARRAY['owner', 'staff']))
  WITH CHECK (private.has_role(business_id, ARRAY['owner', 'staff']));--> statement-breakpoint

-- Read-only for the application: writes arrive through the receiving and
-- adjustment functions, never as a direct insert from a request.
CREATE POLICY "stock_movements_select" ON "stock_movements" FOR SELECT TO "authenticated"
  USING (private.is_member(business_id));--> statement-breakpoint
CREATE POLICY "purchase_receipts_select" ON "purchase_receipts" FOR SELECT TO "authenticated"
  USING (private.is_member(business_id));--> statement-breakpoint
CREATE POLICY "purchase_receipt_lines_select" ON "purchase_receipt_lines" FOR SELECT TO "authenticated"
  USING (private.is_member(business_id));--> statement-breakpoint

-- 5. Grants. A policy is not a grant: without these the table is permission denied
--    even when a policy would allow the row. Caught by the Phase 3 smoke test on
--    purchase_orders.
GRANT SELECT ON
  "businesses", "business_members", "categories", "suppliers", "products",
  "stock_movements", "purchase_orders", "purchase_order_lines",
  "purchase_receipts", "purchase_receipt_lines"
TO "authenticated";--> statement-breakpoint
GRANT INSERT, UPDATE ON
  "categories", "suppliers", "products", "purchase_orders", "purchase_order_lines"
TO "authenticated";--> statement-breakpoint
GRANT INSERT, UPDATE, DELETE ON "business_members" TO "authenticated";--> statement-breakpoint
GRANT UPDATE ON "businesses" TO "authenticated";--> statement-breakpoint

-- Ledger and receipts stay closed to direct application writes.
REVOKE INSERT, UPDATE, DELETE ON
  "stock_movements", "purchase_receipts", "purchase_receipt_lines"
FROM "authenticated";--> statement-breakpoint

GRANT EXECUTE ON FUNCTION "private"."is_member"(uuid) TO "authenticated";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "private"."has_role"(uuid, text[]) TO "authenticated";--> statement-breakpoint

-- 6. Derived stock. security_invoker makes the view obey the caller's RLS rather
--    than the owner's, so it cannot leak across businesses.
CREATE VIEW "public"."product_stock" WITH (security_invoker = true) AS
SELECT p.id AS product_id,
       p.business_id,
       COALESCE(SUM(m.quantity_delta), 0) AS on_hand
FROM "products" p
LEFT JOIN "stock_movements" m ON m.product_id = p.id
GROUP BY p.id, p.business_id;--> statement-breakpoint
GRANT SELECT ON "product_stock" TO "authenticated";
