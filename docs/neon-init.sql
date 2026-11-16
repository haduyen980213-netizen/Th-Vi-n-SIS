-- =============================================================================
-- THƯ VIỆN SIS - Neon PostgreSQL Schema Initialization (45 tables + indexes + FKs)
-- Dán toàn bộ nội dung file này vào Neon Console -> SQL Editor và bấm Run (1 lần).
-- Lưu ý: File này tạo cấu trúc 45 bảng. Sau khi chạy xong, khi mở web trên Vercel,
-- hệ thống sẽ tự động nạp dữ liệu mặc định (danh mục, bản vẽ mẫu, admin, cấu hình).
-- =============================================================================

CREATE TABLE IF NOT EXISTS "admin_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_user_id" integer NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"details_json" jsonb,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL

);

CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_user_id" integer,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"before_json" jsonb,
	"after_json" jsonb,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL

);

CREATE TABLE IF NOT EXISTS "banners" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"image_url" text NOT NULL,
	"target_url" text,
	"position" text DEFAULT 'HOME_HERO' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL

);

CREATE TABLE IF NOT EXISTS "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_id" integer,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"icon_name" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")

);

CREATE TABLE IF NOT EXISTS "coupons" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"discount_type" text NOT NULL,
	"discount_value" integer NOT NULL,
	"max_usage" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code")

);

CREATE TABLE IF NOT EXISTS "download_entitlements" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"order_item_id" integer,
	"max_downloads" integer DEFAULT 20 NOT NULL,
	"downloads_used" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp,
	"is_revoked" boolean DEFAULT false NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL

);

CREATE TABLE IF NOT EXISTS "download_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"entitlement_id" integer,
	"file_id" integer,
	"ip_address" text,
	"user_agent" text,
	"signed_url_token_hash" text,
	"downloaded_at" timestamp DEFAULT now() NOT NULL

);

CREATE TABLE IF NOT EXISTS "email_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipient_email" text NOT NULL,
	"template_code" text NOT NULL,
	"subject" text NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"error_message" text,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL

);

CREATE TABLE IF NOT EXISTS "favorites" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL

);

CREATE TABLE IF NOT EXISTS "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link_url" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL

);

CREATE TABLE IF NOT EXISTS "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"seller_id" integer NOT NULL,
	"listed_price_snapshot_vnd" integer NOT NULL,
	"unit_price_snapshot_vnd" integer NOT NULL,
	"price_source" text NOT NULL,
	"commission_rate_bps_snapshot" integer NOT NULL,
	"seller_revenue_vnd" integer NOT NULL,
	"platform_fee_vnd" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL

);

CREATE TABLE IF NOT EXISTS "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_code" text NOT NULL,
	"buyer_id" integer NOT NULL,
	"coupon_id" integer,
	"subtotal_vnd" integer NOT NULL,
	"discount_vnd" integer DEFAULT 0 NOT NULL,
	"total_amount_vnd" integer NOT NULL,
	"status" text DEFAULT 'COMPLETED' NOT NULL,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_code_unique" UNIQUE("order_code")

);

CREATE TABLE IF NOT EXISTS "payment_providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"config_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_providers_code_unique" UNIQUE("code")

);

CREATE TABLE IF NOT EXISTS "payment_reconciliations" (
	"id" serial PRIMARY KEY NOT NULL,
	"topup_order_id" integer,
	"webhook_id" integer,
	"discrepancy_type" text NOT NULL,
	"expected_amount_vnd" integer DEFAULT 0 NOT NULL,
	"actual_amount_vnd" integer DEFAULT 0 NOT NULL,
	"resolution_note" text,
	"resolved_by" integer,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL

);

CREATE TABLE IF NOT EXISTS "payment_webhooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_code" text NOT NULL,
	"external_tx_id" text NOT NULL,
	"signature_valid" boolean DEFAULT false NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"processing_status" text DEFAULT 'RECEIVED' NOT NULL,
	"error_message" text,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp

);

CREATE TABLE IF NOT EXISTS "payout_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"payout_id" integer NOT NULL,
	"bank_ref_code" text NOT NULL,
	"amount_vnd" integer NOT NULL,
	"executed_by" integer NOT NULL,
	"executed_at" timestamp DEFAULT now() NOT NULL

);

CREATE TABLE IF NOT EXISTS "permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"module" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_code_unique" UNIQUE("code")

);

CREATE TABLE IF NOT EXISTS "price_change_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"product_id" integer NOT NULL,
	"previous_price_vnd" integer,
	"new_price_vnd" integer NOT NULL,
	"price_type" text NOT NULL,
	"changed_by" integer NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL

);

CREATE TABLE IF NOT EXISTS "product_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"parent_id" integer,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp

);

CREATE TABLE IF NOT EXISTS "product_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"storage_bucket" text DEFAULT 'sis-private-vault' NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"checksum_sha256" text,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"version_label" text DEFAULT 'v1.0' NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL

);

CREATE TABLE IF NOT EXISTS "product_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"image_url" text NOT NULL,
	"caption" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL

);

CREATE TABLE IF NOT EXISTS "product_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL

);

CREATE TABLE IF NOT EXISTS "product_tag_relations" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"tag_id" integer NOT NULL

);

CREATE TABLE IF NOT EXISTS "product_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	CONSTRAINT "product_tags_slug_unique" UNIQUE("slug")

);

CREATE TABLE IF NOT EXISTS "product_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"version_number" text NOT NULL,
	"changelog" text,
	"file_id" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL

);

CREATE TABLE IF NOT EXISTS "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"description" text NOT NULL,
	"category_id" integer NOT NULL,
	"seller_id" integer NOT NULL,
	"listed_price_vnd" integer DEFAULT 0 NOT NULL,
	"is_free" boolean DEFAULT false NOT NULL,
	"file_format" text NOT NULL,
	"software_version" text,
	"file_size_bytes" bigint DEFAULT 0 NOT NULL,
	"file_size_label" text NOT NULL,
	"page_or_sheet_count" integer DEFAULT 1 NOT NULL,
	"thumbnail_url" text NOT NULL,
	"approval_status" text DEFAULT 'PENDING' NOT NULL,
	"rejection_reason" text,
	"is_featured" boolean DEFAULT false NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"purchase_count" integer DEFAULT 0 NOT NULL,
	"download_count" integer DEFAULT 0 NOT NULL,
	"rating_avg" integer DEFAULT 50 NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "products_code_unique" UNIQUE("code"),
	CONSTRAINT "products_slug_unique" UNIQUE("slug")

);

CREATE TABLE IF NOT EXISTS "refunds" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"amount_vnd" integer NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"processed_by" integer,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL

);

CREATE TABLE IF NOT EXISTS "role_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"role_id" integer NOT NULL,
	"permission_id" integer NOT NULL

);

CREATE TABLE IF NOT EXISTS "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "roles_code_unique" UNIQUE("code")

);

CREATE TABLE IF NOT EXISTS "seller_balances" (
	"id" serial PRIMARY KEY NOT NULL,
	"seller_id" integer NOT NULL,
	"available_balance_vnd" integer DEFAULT 0 NOT NULL,
	"pending_balance_vnd" integer DEFAULT 0 NOT NULL,
	"total_earned_vnd" integer DEFAULT 0 NOT NULL,
	"total_withdrawn_vnd" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seller_balances_seller_id_unique" UNIQUE("seller_id")

);

CREATE TABLE IF NOT EXISTS "seller_commissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"seller_id" integer NOT NULL,
	"order_item_id" integer NOT NULL,
	"gross_amount_vnd" integer NOT NULL,
	"commission_rate_bps" integer NOT NULL,
	"seller_net_vnd" integer NOT NULL,
	"platform_fee_vnd" integer NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"available_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seller_commissions_order_item_id_unique" UNIQUE("order_item_id")

);

CREATE TABLE IF NOT EXISTS "seller_payouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"payout_code" text NOT NULL,
	"seller_id" integer NOT NULL,
	"amount_vnd" integer NOT NULL,
	"bank_name" text NOT NULL,
	"bank_account_number" text NOT NULL,
	"bank_account_holder" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seller_payouts_payout_code_unique" UNIQUE("payout_code")

);

CREATE TABLE IF NOT EXISTS "seller_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"seller_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL

);

CREATE TABLE IF NOT EXISTS "sellers" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"display_name" text NOT NULL,
	"slug" text NOT NULL,
	"specialty" text,
	"bio" text,
	"verified_status" text DEFAULT 'PENDING' NOT NULL,
	"commission_rate_bps" integer DEFAULT 7000 NOT NULL,
	"bank_name" text,
	"bank_account_number" text,
	"bank_account_holder" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sellers_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "sellers_slug_unique" UNIQUE("slug")

);

CREATE TABLE IF NOT EXISTS "site_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"group_name" text DEFAULT 'GENERAL' NOT NULL,
	"description" text,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "site_settings_key_unique" UNIQUE("key")

);

CREATE TABLE IF NOT EXISTS "support_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_code" text NOT NULL,
	"user_id" integer,
	"contact_name" text NOT NULL,
	"contact_email" text NOT NULL,
	"subject" text NOT NULL,
	"category" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"assigned_to" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "support_tickets_ticket_code_unique" UNIQUE("ticket_code")

);

CREATE TABLE IF NOT EXISTS "system_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"level" text DEFAULT 'INFO' NOT NULL,
	"module" text NOT NULL,
	"message" text NOT NULL,
	"meta_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL

);

CREATE TABLE IF NOT EXISTS "topup_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"topup_code" text NOT NULL,
	"user_id" integer NOT NULL,
	"provider_id" integer,
	"requested_amount_vnd" integer NOT NULL,
	"received_amount_vnd" integer DEFAULT 0 NOT NULL,
	"qr_payload_url" text,
	"bank_account_number" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "topup_orders_topup_code_unique" UNIQUE("topup_code")

);

CREATE TABLE IF NOT EXISTS "user_product_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"custom_price_vnd" integer NOT NULL,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"note" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL

);

CREATE TABLE IF NOT EXISTS "user_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"company_name" text,
	"job_title" text,
	"tax_code" text,
	"address" text,
	"city" text,
	"bio" text,
	"website_url" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_user_id_unique" UNIQUE("user_id")

);

CREATE TABLE IF NOT EXISTS "user_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	"assigned_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL

);

CREATE TABLE IF NOT EXISTS "user_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"session_token_hash" text NOT NULL,
	"auth_provider" text DEFAULT 'LOCAL' NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_sessions_session_token_hash_unique" UNIQUE("session_token_hash")

);

CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"uid" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"password_hash" text,
	"full_name" text NOT NULL,
	"avatar_url" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"email_verify_token" text,
	"reset_password_token" text,
	"reset_password_expires_at" timestamp,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "users_uid_unique" UNIQUE("uid"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")

);

CREATE TABLE IF NOT EXISTS "wallet_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tx_code" text NOT NULL,
	"wallet_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"tx_type" text NOT NULL,
	"direction" text NOT NULL,
	"amount_vnd" integer NOT NULL,
	"balance_before_vnd" integer NOT NULL,
	"balance_after_vnd" integer NOT NULL,
	"status" text DEFAULT 'COMPLETED' NOT NULL,
	"source" text NOT NULL,
	"reference_code" text,
	"description" text NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_transactions_tx_code_unique" UNIQUE("tx_code"),
	CONSTRAINT "wallet_transactions_idempotency_key_unique" UNIQUE("idempotency_key")

);

CREATE TABLE IF NOT EXISTS "wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"available_balance_vnd" integer DEFAULT 0 NOT NULL,
	"pending_balance_vnd" integer DEFAULT 0 NOT NULL,
	"total_deposited_vnd" integer DEFAULT 0 NOT NULL,
	"total_spent_vnd" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'VND' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_user_id_unique" UNIQUE("user_id")

);

DO $$ BEGIN
  ALTER TABLE "admin_logs" ADD CONSTRAINT "admin_logs_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "download_entitlements" ADD CONSTRAINT "download_entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "download_entitlements" ADD CONSTRAINT "download_entitlements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "download_entitlements" ADD CONSTRAINT "download_entitlements_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "download_logs" ADD CONSTRAINT "download_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "download_logs" ADD CONSTRAINT "download_logs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "download_logs" ADD CONSTRAINT "download_logs_entitlement_id_download_entitlements_id_fk" FOREIGN KEY ("entitlement_id") REFERENCES "public"."download_entitlements"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "download_logs" ADD CONSTRAINT "download_logs_file_id_product_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."product_files"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "favorites" ADD CONSTRAINT "favorites_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "order_items" ADD CONSTRAINT "order_items_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "payment_reconciliations" ADD CONSTRAINT "payment_reconciliations_topup_order_id_topup_orders_id_fk" FOREIGN KEY ("topup_order_id") REFERENCES "public"."topup_orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "payment_reconciliations" ADD CONSTRAINT "payment_reconciliations_webhook_id_payment_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."payment_webhooks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "payment_reconciliations" ADD CONSTRAINT "payment_reconciliations_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "payout_transactions" ADD CONSTRAINT "payout_transactions_payout_id_seller_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."seller_payouts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "payout_transactions" ADD CONSTRAINT "payout_transactions_executed_by_users_id_fk" FOREIGN KEY ("executed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "price_change_logs" ADD CONSTRAINT "price_change_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "price_change_logs" ADD CONSTRAINT "price_change_logs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "price_change_logs" ADD CONSTRAINT "price_change_logs_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "product_comments" ADD CONSTRAINT "product_comments_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "product_comments" ADD CONSTRAINT "product_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "product_files" ADD CONSTRAINT "product_files_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "product_tag_relations" ADD CONSTRAINT "product_tag_relations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "product_tag_relations" ADD CONSTRAINT "product_tag_relations_tag_id_product_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."product_tags"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_file_id_product_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."product_files"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "products" ADD CONSTRAINT "products_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "seller_balances" ADD CONSTRAINT "seller_balances_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "seller_commissions" ADD CONSTRAINT "seller_commissions_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "seller_commissions" ADD CONSTRAINT "seller_commissions_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "seller_payouts" ADD CONSTRAINT "seller_payouts_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "seller_payouts" ADD CONSTRAINT "seller_payouts_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "seller_products" ADD CONSTRAINT "seller_products_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "seller_products" ADD CONSTRAINT "seller_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "sellers" ADD CONSTRAINT "sellers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "topup_orders" ADD CONSTRAINT "topup_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "topup_orders" ADD CONSTRAINT "topup_orders_provider_id_payment_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."payment_providers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "user_product_prices" ADD CONSTRAINT "user_product_prices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "user_product_prices" ADD CONSTRAINT "user_product_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "user_product_prices" ADD CONSTRAINT "user_product_prices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "idx_categories_sort" ON "categories" USING btree ("sort_order");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_entitlement_user_product" ON "download_entitlements" USING btree ("user_id","product_id");

CREATE INDEX IF NOT EXISTS "idx_download_logs_user" ON "download_logs" USING btree ("user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_favorites_user_product" ON "favorites" USING btree ("user_id","product_id");

CREATE INDEX IF NOT EXISTS "idx_notifications_user" ON "notifications" USING btree ("user_id");

CREATE INDEX IF NOT EXISTS "idx_order_items_order" ON "order_items" USING btree ("order_id");

CREATE INDEX IF NOT EXISTS "idx_orders_buyer" ON "orders" USING btree ("buyer_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_webhook_provider_ext_tx" ON "payment_webhooks" USING btree ("provider_code","external_tx_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_product_review_user" ON "product_reviews" USING btree ("product_id","user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_product_tag" ON "product_tag_relations" USING btree ("product_id","tag_id");

CREATE INDEX IF NOT EXISTS "idx_products_category" ON "products" USING btree ("category_id");

CREATE INDEX IF NOT EXISTS "idx_products_seller" ON "products" USING btree ("seller_id");

CREATE INDEX IF NOT EXISTS "idx_products_approval" ON "products" USING btree ("approval_status");

CREATE INDEX IF NOT EXISTS "idx_products_featured" ON "products" USING btree ("is_featured");

CREATE INDEX IF NOT EXISTS "idx_products_is_free" ON "products" USING btree ("is_free");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_role_permissions_role_perm" ON "role_permissions" USING btree ("role_id","permission_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_seller_product" ON "seller_products" USING btree ("seller_id","product_id");

CREATE INDEX IF NOT EXISTS "idx_sellers_status" ON "sellers" USING btree ("verified_status");

CREATE INDEX IF NOT EXISTS "idx_topup_orders_user" ON "topup_orders" USING btree ("user_id");

CREATE INDEX IF NOT EXISTS "idx_topup_orders_status" ON "topup_orders" USING btree ("status");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_product_price" ON "user_product_prices" USING btree ("user_id","product_id");

CREATE INDEX IF NOT EXISTS "idx_user_product_prices_user" ON "user_product_prices" USING btree ("user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_roles_user_role" ON "user_roles" USING btree ("user_id","role_id");

CREATE INDEX IF NOT EXISTS "idx_user_sessions_user_id" ON "user_sessions" USING btree ("user_id");

CREATE INDEX IF NOT EXISTS "idx_users_status" ON "users" USING btree ("status");

CREATE INDEX IF NOT EXISTS "idx_users_deleted_at" ON "users" USING btree ("deleted_at");

CREATE INDEX IF NOT EXISTS "idx_wallet_tx_wallet_id" ON "wallet_transactions" USING btree ("wallet_id");

CREATE INDEX IF NOT EXISTS "idx_wallet_tx_user_id" ON "wallet_transactions" USING btree ("user_id");

CREATE INDEX IF NOT EXISTS "idx_wallet_tx_ref" ON "wallet_transactions" USING btree ("reference_code");
