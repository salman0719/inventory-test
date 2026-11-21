CREATE TABLE "business_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_members_role_check" CHECK ("business_members"."role" in ('owner', 'staff', 'viewer'))
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"business_type" text NOT NULL,
	"currency_code" text DEFAULT 'AUD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_business_type_check" CHECK ("businesses"."business_type" in ('cafe', 'retail', 'other')),
	CONSTRAINT "businesses_currency_code_check" CHECK (char_length("businesses"."currency_code") = 3)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"category_id" uuid,
	"supplier_id" uuid,
	"name" text NOT NULL,
	"sku" text NOT NULL,
	"description" text,
	"unit_of_measure" text DEFAULT 'ea' NOT NULL,
	"cost_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"selling_price" numeric(12, 2),
	"reorder_level" numeric(12, 3) DEFAULT '0' NOT NULL,
	"image_path" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_cost_price_check" CHECK ("products"."cost_price" >= 0),
	CONSTRAINT "products_selling_price_check" CHECK ("products"."selling_price" is null or "products"."selling_price" >= 0),
	CONSTRAINT "products_reorder_level_check" CHECK ("products"."reorder_level" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity_ordered" numeric(12, 3) NOT NULL,
	"received_quantity" numeric(12, 3) DEFAULT '0' NOT NULL,
	"unit_cost" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_order_lines_ordered_check" CHECK ("purchase_order_lines"."quantity_ordered" > 0),
	CONSTRAINT "purchase_order_lines_received_check" CHECK ("purchase_order_lines"."received_quantity" >= 0 and "purchase_order_lines"."received_quantity" <= "purchase_order_lines"."quantity_ordered")
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"order_number" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"ordered_at" timestamp with time zone,
	"expected_delivery_at" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_status_check" CHECK ("purchase_orders"."status" in ('draft', 'ordered', 'partially_received', 'received', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "purchase_receipt_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL,
	"purchase_order_line_id" uuid NOT NULL,
	"quantity_received" numeric(12, 3) NOT NULL,
	"unit_cost" numeric(12, 2),
	CONSTRAINT "purchase_receipt_lines_quantity_check" CHECK ("purchase_receipt_lines"."quantity_received" > 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"received_by" uuid,
	"idempotency_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"movement_type" text NOT NULL,
	"quantity_delta" numeric(12, 3) NOT NULL,
	"reason" text,
	"reference_type" text,
	"reference_id" uuid,
	"unit_cost" numeric(12, 2),
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_type_check" CHECK ("stock_movements"."movement_type" in ('opening', 'received', 'stock_in', 'stock_out', 'adjustment')),
	CONSTRAINT "stock_movements_delta_check" CHECK ("stock_movements"."quantity_delta" <> 0)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"email" text,
	"phone" text,
	"address" text,
	"notes" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "business_members_business_user_key" ON "business_members" USING btree ("business_id","user_id");
--> statement-breakpoint
CREATE INDEX "business_members_user_idx" ON "business_members" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "categories_business_id_key" ON "categories" USING btree ("business_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "categories_business_name_key" ON "categories" USING btree ("business_id",lower("name"));
--> statement-breakpoint
CREATE UNIQUE INDEX "products_business_sku_key" ON "products" USING btree ("business_id","sku");
--> statement-breakpoint
CREATE UNIQUE INDEX "products_business_id_key" ON "products" USING btree ("business_id","id");
--> statement-breakpoint
CREATE INDEX "products_business_archived_name_idx" ON "products" USING btree ("business_id","is_archived","name");
--> statement-breakpoint
CREATE INDEX "products_business_supplier_idx" ON "products" USING btree ("business_id","supplier_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_order_lines_order_product_key" ON "purchase_order_lines" USING btree ("purchase_order_id","product_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_order_lines_business_id_key" ON "purchase_order_lines" USING btree ("business_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_business_number_key" ON "purchase_orders" USING btree ("business_id","order_number");
--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_business_id_key" ON "purchase_orders" USING btree ("business_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_one_open_per_supplier" ON "purchase_orders" USING btree ("business_id","supplier_id") WHERE "purchase_orders"."status" in ('draft', 'ordered', 'partially_received');
--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_receipts_business_idempotency_key" ON "purchase_receipts" USING btree ("business_id","idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_receipts_business_id_key" ON "purchase_receipts" USING btree ("business_id","id");
--> statement-breakpoint
CREATE INDEX "stock_movements_business_product_created_idx" ON "stock_movements" USING btree ("business_id","product_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_business_id_key" ON "suppliers" USING btree ("business_id","id");
--> statement-breakpoint
CREATE INDEX "suppliers_business_name_idx" ON "suppliers" USING btree ("business_id","name");
--> statement-breakpoint
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_fk" FOREIGN KEY ("business_id","category_id") REFERENCES "public"."categories"("business_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_fk" FOREIGN KEY ("business_id","supplier_id") REFERENCES "public"."suppliers"("business_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_order_fk" FOREIGN KEY ("business_id","purchase_order_id") REFERENCES "public"."purchase_orders"("business_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_product_fk" FOREIGN KEY ("business_id","product_id") REFERENCES "public"."products"("business_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_fk" FOREIGN KEY ("business_id","supplier_id") REFERENCES "public"."suppliers"("business_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_receipt_fk" FOREIGN KEY ("business_id","receipt_id") REFERENCES "public"."purchase_receipts"("business_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_order_line_fk" FOREIGN KEY ("business_id","purchase_order_line_id") REFERENCES "public"."purchase_order_lines"("business_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_order_fk" FOREIGN KEY ("business_id","purchase_order_id") REFERENCES "public"."purchase_orders"("business_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_fk" FOREIGN KEY ("business_id","product_id") REFERENCES "public"."products"("business_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
