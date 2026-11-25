-- Slice E: reorder targets.
--
-- One nullable column. A product without a target is not unset in the reorder
-- screen: the suggested quantity doubles its reorder level instead. Storing the
-- fallback would make an old product look deliberately configured, and changing its
-- reorder level would then need a second write to keep the target in step.

ALTER TABLE "products" ADD COLUMN "target_stock_level" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_target_stock_level_check"
  CHECK ("target_stock_level" IS NULL OR "target_stock_level" >= 0);--> statement-breakpoint
COMMENT ON COLUMN "products"."target_stock_level" IS
  'Reorder suggestions aim for this level; null means twice the reorder level.';
