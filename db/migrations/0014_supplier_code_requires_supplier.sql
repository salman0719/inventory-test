-- A supplier's catalogue code only means something against a supplier, and the
-- unique index added by 0013 is partial: it deliberately ignores rows with no
-- supplier. Validation already refuses the combination at the server boundary;
-- this makes the database say the same thing to any other writer.

ALTER TABLE "products" ADD CONSTRAINT "products_supplier_code_check"
  CHECK ("supplier_sku" IS NULL OR "supplier_id" IS NOT NULL);
