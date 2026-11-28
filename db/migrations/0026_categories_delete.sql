-- Categories management moves out of Settings onto its own Products page.
--
-- Until now `authenticated` could insert and update a category but never delete
-- one: there was no DELETE policy and no DELETE grant. Rename worked through
-- the existing UPDATE policy; add worked through INSERT. Deleting an empty
-- category is an owner/staff operation, and a category still referenced by a
-- product is refused by the `products_category_fk` RESTRICT rule, not by RLS.

CREATE POLICY "categories_delete" ON "categories"
  FOR DELETE TO "authenticated"
  USING (private.has_role(business_id, ARRAY['owner', 'staff']));--> statement-breakpoint
GRANT DELETE ON "categories" TO "authenticated";
