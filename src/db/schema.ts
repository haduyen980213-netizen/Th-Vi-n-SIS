import { relations } from 'drizzle-orm';
import {
  AnyPgColumn,
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ============================================================================
// 1. IDENTITY, AUTHENTICATION & RBAC
// ============================================================================

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').notNull().unique(), // Firebase Auth UID or local_<uuid>
    email: text('email').notNull().unique(),
    phone: text('phone').unique(),
    passwordHash: text('password_hash'),
    fullName: text('full_name').notNull(),
    avatarUrl: text('avatar_url'),
    emailVerified: boolean('email_verified').notNull().default(false),
    emailVerifyToken: text('email_verify_token'),
    resetPasswordToken: text('reset_password_token'),
    resetPasswordExpiresAt: timestamp('reset_password_expires_at'),
    status: text('status').notNull().default('ACTIVE'), // ACTIVE | LOCKED | PENDING
    lastLoginAt: timestamp('last_login_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('idx_users_status').on(table.status),
    index('idx_users_deleted_at').on(table.deletedAt),
  ]
);

export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(), // GUEST | MEMBER | SELLER | MODERATOR | ACCOUNTANT | ADMIN | SUPER_ADMIN
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const permissions = pgTable('permissions', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(), // e.g., product:approve, pricing:manage, wallet:adjust
  module: text('module').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userRoles = pgTable(
  'user_roles',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    roleId: integer('role_id')
      .references(() => roles.id, { onDelete: 'cascade' })
      .notNull(),
    assignedBy: integer('assigned_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('uq_user_roles_user_role').on(table.userId, table.roleId)]
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: serial('id').primaryKey(),
    roleId: integer('role_id')
      .references(() => roles.id, { onDelete: 'cascade' })
      .notNull(),
    permissionId: integer('permission_id')
      .references(() => permissions.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (table) => [uniqueIndex('uq_role_permissions_role_perm').on(table.roleId, table.permissionId)]
);

export const userProfiles = pgTable('user_profiles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  companyName: text('company_name'),
  jobTitle: text('job_title'), // Kiến trúc sư, Kỹ sư kết cấu, Sinh viên...
  taxCode: text('tax_code'),
  address: text('address'),
  city: text('city'),
  bio: text('bio'),
  websiteUrl: text('website_url'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const userSessions = pgTable(
  'user_sessions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    sessionTokenHash: text('session_token_hash').notNull().unique(),
    authProvider: text('auth_provider').notNull().default('LOCAL'), // LOCAL | FIREBASE_GOOGLE
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_user_sessions_user_id').on(table.userId)]
);

// ============================================================================
// 2. CATALOG, CATEGORIES, SELLERS & TECHNICAL DRAWINGS
// ============================================================================

export const categories = pgTable(
  'categories',
  {
    id: serial('id').primaryKey(),
    parentId: integer('parent_id').references((): AnyPgColumn => categories.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description'),
    iconName: text('icon_name'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [index('idx_categories_sort').on(table.sortOrder)]
);

export const sellers = pgTable(
  'sellers',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    displayName: text('display_name').notNull(),
    slug: text('slug').notNull().unique(),
    specialty: text('specialty'), // Kiến trúc dân dụng, BIM MEP, Kết cấu thép...
    bio: text('bio'),
    verifiedStatus: text('verified_status').notNull().default('PENDING'), // PENDING | VERIFIED | LOCKED
    commissionRateBps: integer('commission_rate_bps').notNull().default(7000), // 70.00% to seller, 30.00% platform
    bankName: text('bank_name'),
    bankAccountNumber: text('bank_account_number'),
    bankAccountHolder: text('bank_account_holder'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('idx_sellers_status').on(table.verifiedStatus)]
);

export const products = pgTable(
  'products',
  {
    id: serial('id').primaryKey(),
    code: text('code').notNull().unique(), // e.g., SIS-KT-001
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    description: text('description').notNull(),
    categoryId: integer('category_id')
      .references(() => categories.id)
      .notNull(),
    sellerId: integer('seller_id')
      .references(() => sellers.id)
      .notNull(),
    listedPriceVnd: integer('listed_price_vnd').notNull().default(0),
    isFree: boolean('is_free').notNull().default(false),
    fileFormat: text('file_format').notNull(), // DWG, RVT, SKP, IFC, PDF, ZIP
    softwareVersion: text('software_version'), // AutoCAD 2022+, Revit 2024...
    fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }).notNull().default(0),
    fileSizeLabel: text('file_size_label').notNull(), // e.g., 42.5 MB
    pageOrSheetCount: integer('page_or_sheet_count').notNull().default(1),
    thumbnailUrl: text('thumbnail_url').notNull(),
    approvalStatus: text('approval_status').notNull().default('PENDING'), // DRAFT | PENDING | APPROVED | REJECTED | HIDDEN | LOCKED
    rejectionReason: text('rejection_reason'),
    isFeatured: boolean('is_featured').notNull().default(false),
    viewCount: integer('view_count').notNull().default(0),
    purchaseCount: integer('purchase_count').notNull().default(0),
    downloadCount: integer('download_count').notNull().default(0),
    ratingAvg: integer('rating_avg').notNull().default(50), // 50 = 5.0 stars (x10)
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('idx_products_category').on(table.categoryId),
    index('idx_products_seller').on(table.sellerId),
    index('idx_products_approval').on(table.approvalStatus),
    index('idx_products_featured').on(table.isFeatured),
    index('idx_products_is_free').on(table.isFree),
  ]
);

export const productFiles = pgTable('product_files', {
  id: serial('id').primaryKey(),
  productId: integer('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  storageBucket: text('storage_bucket').notNull().default('sis-private-vault'),
  storageKey: text('storage_key').notNull(),
  originalFilename: text('original_filename').notNull(),
  mimeType: text('mime_type').notNull(),
  checksumSha256: text('checksum_sha256'),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull().default(0),
  versionLabel: text('version_label').notNull().default('v1.0'),
  isPrimary: boolean('is_primary').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const productImages = pgTable('product_images', {
  id: serial('id').primaryKey(),
  productId: integer('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  imageUrl: text('image_url').notNull(),
  caption: text('caption'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const productTags = pgTable('product_tags', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
});

export const productTagRelations = pgTable(
  'product_tag_relations',
  {
    id: serial('id').primaryKey(),
    productId: integer('product_id')
      .references(() => products.id, { onDelete: 'cascade' })
      .notNull(),
    tagId: integer('tag_id')
      .references(() => productTags.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (table) => [uniqueIndex('uq_product_tag').on(table.productId, table.tagId)]
);

export const productVersions = pgTable('product_versions', {
  id: serial('id').primaryKey(),
  productId: integer('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  versionNumber: text('version_number').notNull(),
  changelog: text('changelog'),
  fileId: integer('file_id').references(() => productFiles.id),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const productReviews = pgTable(
  'product_reviews',
  {
    id: serial('id').primaryKey(),
    productId: integer('product_id')
      .references(() => products.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    rating: integer('rating').notNull(), // 1..5
    comment: text('comment'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('uq_product_review_user').on(table.productId, table.userId)]
);

export const productComments = pgTable('product_comments', {
  id: serial('id').primaryKey(),
  productId: integer('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  parentId: integer('parent_id'),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

export const favorites = pgTable(
  'favorites',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    productId: integer('product_id')
      .references(() => products.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('uq_favorites_user_product').on(table.userId, table.productId)]
);

// ============================================================================
// 3. ACCOUNT-SPECIFIC PRICING ENGINE (CORE FEATURE)
// ============================================================================

export const userProductPrices = pgTable(
  'user_product_prices',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    productId: integer('product_id')
      .references(() => products.id, { onDelete: 'cascade' })
      .notNull(),
    customPriceVnd: integer('custom_price_vnd').notNull(),
    startsAt: timestamp('starts_at'),
    endsAt: timestamp('ends_at'),
    note: text('note'),
    isActive: boolean('is_active').notNull().default(true),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_user_product_price').on(table.userId, table.productId),
    index('idx_user_product_prices_user').on(table.userId),
  ]
);

export const priceChangeLogs = pgTable('price_change_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  productId: integer('product_id')
    .references(() => products.id)
    .notNull(),
  previousPriceVnd: integer('previous_price_vnd'),
  newPriceVnd: integer('new_price_vnd').notNull(),
  priceType: text('price_type').notNull(), // LISTED | USER_CUSTOM | BULK_UPDATE | REMOVED
  changedBy: integer('changed_by')
    .references(() => users.id)
    .notNull(),
  reason: text('reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============================================================================
// 4. INTERNAL WALLET & IMMUTABLE LEDGER
// ============================================================================

export const wallets = pgTable('wallets', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  availableBalanceVnd: integer('available_balance_vnd').notNull().default(0),
  pendingBalanceVnd: integer('pending_balance_vnd').notNull().default(0),
  totalDepositedVnd: integer('total_deposited_vnd').notNull().default(0),
  totalSpentVnd: integer('total_spent_vnd').notNull().default(0),
  currency: text('currency').notNull().default('VND'),
  version: integer('version').notNull().default(1), // Optimistic concurrency guard
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const walletTransactions = pgTable(
  'wallet_transactions',
  {
    id: serial('id').primaryKey(),
    txCode: text('tx_code').notNull().unique(), // e.g., TX-20261115-0001
    walletId: integer('wallet_id')
      .references(() => wallets.id)
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    txType: text('tx_type').notNull(), // TOPUP | PURCHASE | REFUND | ADMIN_ADJUST | PAYOUT
    direction: text('direction').notNull(), // CREDIT | DEBIT
    amountVnd: integer('amount_vnd').notNull(),
    balanceBeforeVnd: integer('balance_before_vnd').notNull(),
    balanceAfterVnd: integer('balance_after_vnd').notNull(),
    status: text('status').notNull().default('COMPLETED'), // PENDING | COMPLETED | FAILED | REVERSED
    source: text('source').notNull(), // VIETQR | WALLET_CHECKOUT | ADMIN_PANEL | SYSTEM
    referenceCode: text('reference_code'),
    description: text('description').notNull(),
    idempotencyKey: text('idempotency_key').unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_wallet_tx_wallet_id').on(table.walletId),
    index('idx_wallet_tx_user_id').on(table.userId),
    index('idx_wallet_tx_ref').on(table.referenceCode),
  ]
);

// ============================================================================
// 5. QR TOPUP, PAYMENT PROVIDERS, WEBHOOKS & RECONCILIATION
// ============================================================================

export const paymentProviders = pgTable('payment_providers', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(), // VIETQR_SEPAY | VIETQR_CASSO | PAYOS
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  configJson: jsonb('config_json'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const topupOrders = pgTable(
  'topup_orders',
  {
    id: serial('id').primaryKey(),
    topupCode: text('topup_code').notNull().unique(), // e.g., SISNAP261115001
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    providerId: integer('provider_id').references(() => paymentProviders.id),
    requestedAmountVnd: integer('requested_amount_vnd').notNull(),
    receivedAmountVnd: integer('received_amount_vnd').notNull().default(0),
    qrPayloadUrl: text('qr_payload_url'),
    bankAccountNumber: text('bank_account_number'),
    status: text('status').notNull().default('PENDING'), // PENDING | PAID | UNDERPAID | OVERPAID | EXPIRED | CANCELLED
    expiresAt: timestamp('expires_at').notNull(),
    paidAt: timestamp('paid_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_topup_orders_user').on(table.userId),
    index('idx_topup_orders_status').on(table.status),
  ]
);

export const paymentWebhooks = pgTable(
  'payment_webhooks',
  {
    id: serial('id').primaryKey(),
    providerCode: text('provider_code').notNull(),
    externalTxId: text('external_tx_id').notNull(),
    signatureValid: boolean('signature_valid').notNull().default(false),
    rawPayload: jsonb('raw_payload').notNull(),
    processingStatus: text('processing_status').notNull().default('RECEIVED'), // RECEIVED | PROCESSED | DUPLICATE | IGNORED | FAILED
    errorMessage: text('error_message'),
    receivedAt: timestamp('received_at').defaultNow().notNull(),
    processedAt: timestamp('processed_at'),
  },
  (table) => [uniqueIndex('uq_webhook_provider_ext_tx').on(table.providerCode, table.externalTxId)]
);

export const paymentReconciliations = pgTable('payment_reconciliations', {
  id: serial('id').primaryKey(),
  topupOrderId: integer('topup_order_id').references(() => topupOrders.id),
  webhookId: integer('webhook_id').references(() => paymentWebhooks.id),
  discrepancyType: text('discrepancy_type').notNull(), // MATCHED | UNDERPAID | OVERPAID | LATE | UNIDENTIFIED
  expectedAmountVnd: integer('expected_amount_vnd').notNull().default(0),
  actualAmountVnd: integer('actual_amount_vnd').notNull().default(0),
  resolutionNote: text('resolution_note'),
  resolvedBy: integer('resolved_by').references(() => users.id),
  resolvedAt: timestamp('resolved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============================================================================
// 6. ORDERS, SNAPSHOT PRICING & DOWNLOAD ENTITLEMENTS
// ============================================================================

export const coupons = pgTable('coupons', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  discountType: text('discount_type').notNull(), // FIXED_VND | PERCENT
  discountValue: integer('discount_value').notNull(),
  maxUsage: integer('max_usage'),
  usedCount: integer('used_count').notNull().default(0),
  startsAt: timestamp('starts_at'),
  endsAt: timestamp('ends_at'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const orders = pgTable(
  'orders',
  {
    id: serial('id').primaryKey(),
    orderCode: text('order_code').notNull().unique(), // e.g., ORD-261115-0001
    buyerId: integer('buyer_id')
      .references(() => users.id)
      .notNull(),
    couponId: integer('coupon_id').references(() => coupons.id),
    subtotalVnd: integer('subtotal_vnd').notNull(),
    discountVnd: integer('discount_vnd').notNull().default(0),
    totalAmountVnd: integer('total_amount_vnd').notNull(),
    status: text('status').notNull().default('COMPLETED'), // PENDING | COMPLETED | REFUNDED | CANCELLED
    paidAt: timestamp('paid_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_orders_buyer').on(table.buyerId)]
);

export const orderItems = pgTable(
  'order_items',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
    productId: integer('product_id')
      .references(() => products.id)
      .notNull(),
    sellerId: integer('seller_id')
      .references(() => sellers.id)
      .notNull(),
    listedPriceSnapshotVnd: integer('listed_price_snapshot_vnd').notNull(),
    unitPriceSnapshotVnd: integer('unit_price_snapshot_vnd').notNull(), // Final price applied (custom or listed)
    priceSource: text('price_source').notNull(), // ACCOUNT_CUSTOM | LISTED | FREE
    commissionRateBpsSnapshot: integer('commission_rate_bps_snapshot').notNull(),
    sellerRevenueVnd: integer('seller_revenue_vnd').notNull(),
    platformFeeVnd: integer('platform_fee_vnd').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_order_items_order').on(table.orderId)]
);

export const downloadEntitlements = pgTable(
  'download_entitlements',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    productId: integer('product_id')
      .references(() => products.id, { onDelete: 'cascade' })
      .notNull(),
    orderItemId: integer('order_item_id').references(() => orderItems.id),
    maxDownloads: integer('max_downloads').notNull().default(20),
    downloadsUsed: integer('downloads_used').notNull().default(0),
    expiresAt: timestamp('expires_at'),
    isRevoked: boolean('is_revoked').notNull().default(false),
    grantedAt: timestamp('granted_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('uq_entitlement_user_product').on(table.userId, table.productId)]
);

export const downloadLogs = pgTable(
  'download_logs',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    productId: integer('product_id')
      .references(() => products.id)
      .notNull(),
    entitlementId: integer('entitlement_id').references(() => downloadEntitlements.id),
    fileId: integer('file_id').references(() => productFiles.id),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    signedUrlTokenHash: text('signed_url_token_hash'),
    downloadedAt: timestamp('downloaded_at').defaultNow().notNull(),
  },
  (table) => [index('idx_download_logs_user').on(table.userId)]
);

export const refunds = pgTable('refunds', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id')
    .references(() => orders.id)
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  amountVnd: integer('amount_vnd').notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('PENDING'), // PENDING | APPROVED | REJECTED
  processedBy: integer('processed_by').references(() => users.id),
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============================================================================
// 7. SELLER MARKETPLACE, COMMISSIONS & PAYOUTS
// ============================================================================

export const sellerProducts = pgTable(
  'seller_products',
  {
    id: serial('id').primaryKey(),
    sellerId: integer('seller_id')
      .references(() => sellers.id, { onDelete: 'cascade' })
      .notNull(),
    productId: integer('product_id')
      .references(() => products.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('uq_seller_product').on(table.sellerId, table.productId)]
);

export const sellerBalances = pgTable('seller_balances', {
  id: serial('id').primaryKey(),
  sellerId: integer('seller_id')
    .references(() => sellers.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  availableBalanceVnd: integer('available_balance_vnd').notNull().default(0),
  pendingBalanceVnd: integer('pending_balance_vnd').notNull().default(0),
  totalEarnedVnd: integer('total_earned_vnd').notNull().default(0),
  totalWithdrawnVnd: integer('total_withdrawn_vnd').notNull().default(0),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const sellerCommissions = pgTable('seller_commissions', {
  id: serial('id').primaryKey(),
  sellerId: integer('seller_id')
    .references(() => sellers.id)
    .notNull(),
  orderItemId: integer('order_item_id')
    .references(() => orderItems.id)
    .notNull()
    .unique(),
  grossAmountVnd: integer('gross_amount_vnd').notNull(),
  commissionRateBps: integer('commission_rate_bps').notNull(),
  sellerNetVnd: integer('seller_net_vnd').notNull(),
  platformFeeVnd: integer('platform_fee_vnd').notNull(),
  status: text('status').notNull().default('PENDING'), // PENDING | AVAILABLE | PAID | REVERSED
  availableAt: timestamp('available_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const sellerPayouts = pgTable('seller_payouts', {
  id: serial('id').primaryKey(),
  payoutCode: text('payout_code').notNull().unique(),
  sellerId: integer('seller_id')
    .references(() => sellers.id)
    .notNull(),
  amountVnd: integer('amount_vnd').notNull(),
  bankName: text('bank_name').notNull(),
  bankAccountNumber: text('bank_account_number').notNull(),
  bankAccountHolder: text('bank_account_holder').notNull(),
  status: text('status').notNull().default('PENDING'), // PENDING | APPROVED | PAID | REJECTED
  reviewedBy: integer('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at'),
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const payoutTransactions = pgTable('payout_transactions', {
  id: serial('id').primaryKey(),
  payoutId: integer('payout_id')
    .references(() => sellerPayouts.id)
    .notNull(),
  bankRefCode: text('bank_ref_code').notNull(),
  amountVnd: integer('amount_vnd').notNull(),
  executedBy: integer('executed_by')
    .references(() => users.id)
    .notNull(),
  executedAt: timestamp('executed_at').defaultNow().notNull(),
});

// ============================================================================
// 8. NOTIFICATIONS, CMS, SUPPORT & AUDIT / SYSTEM LOGS
// ============================================================================

export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    type: text('type').notNull(), // SYSTEM | ORDER | WALLET | APPROVAL | SUPPORT
    title: text('title').notNull(),
    body: text('body').notNull(),
    linkUrl: text('link_url'),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_notifications_user').on(table.userId)]
);

export const banners = pgTable('banners', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  imageUrl: text('image_url').notNull(),
  targetUrl: text('target_url'),
  position: text('position').notNull().default('HOME_HERO'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const siteSettings = pgTable('site_settings', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  groupName: text('group_name').notNull().default('GENERAL'),
  description: text('description'),
  updatedBy: integer('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const supportTickets = pgTable('support_tickets', {
  id: serial('id').primaryKey(),
  ticketCode: text('ticket_code').notNull().unique(),
  userId: integer('user_id').references(() => users.id),
  contactName: text('contact_name').notNull(),
  contactEmail: text('contact_email').notNull(),
  subject: text('subject').notNull(),
  category: text('category').notNull(), // PAYMENT | DOWNLOAD | SELLER | ACCOUNT | OTHER
  message: text('message').notNull(),
  status: text('status').notNull().default('OPEN'), // OPEN | IN_PROGRESS | RESOLVED | CLOSED
  assignedTo: integer('assigned_to').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const adminLogs = pgTable('admin_logs', {
  id: serial('id').primaryKey(),
  adminUserId: integer('admin_user_id')
    .references(() => users.id)
    .notNull(),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id'),
  detailsJson: jsonb('details_json'),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  actorUserId: integer('actor_user_id').references(() => users.id),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  action: text('action').notNull(),
  beforeJson: jsonb('before_json'),
  afterJson: jsonb('after_json'),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const systemLogs = pgTable('system_logs', {
  id: serial('id').primaryKey(),
  level: text('level').notNull().default('INFO'), // INFO | WARN | ERROR
  module: text('module').notNull(),
  message: text('message').notNull(),
  metaJson: jsonb('meta_json'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const emailLogs = pgTable('email_logs', {
  id: serial('id').primaryKey(),
  recipientEmail: text('recipient_email').notNull(),
  templateCode: text('template_code').notNull(),
  subject: text('subject').notNull(),
  status: text('status').notNull().default('QUEUED'), // QUEUED | SENT | FAILED
  errorMessage: text('error_message'),
  sentAt: timestamp('sent_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(userProfiles, {
    fields: [users.id],
    references: [userProfiles.userId],
  }),
  wallet: one(wallets, {
    fields: [users.id],
    references: [wallets.userId],
  }),
  seller: one(sellers, {
    fields: [users.id],
    references: [sellers.userId],
  }),
  userRoles: many(userRoles),
  customPrices: many(userProductPrices),
  orders: many(orders),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  userRoles: many(userRoles),
  rolePermissions: many(rolePermissions),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
  }),
  products: many(products),
}));

export const sellersRelations = relations(sellers, ({ one, many }) => ({
  user: one(users, {
    fields: [sellers.userId],
    references: [users.id],
  }),
  products: many(products),
  balance: one(sellerBalances, {
    fields: [sellers.id],
    references: [sellerBalances.sellerId],
  }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  seller: one(sellers, {
    fields: [products.sellerId],
    references: [sellers.id],
  }),
  files: many(productFiles),
  images: many(productImages),
  tagRelations: many(productTagRelations),
  versions: many(productVersions),
  reviews: many(productReviews),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, {
    fields: [productImages.productId],
    references: [products.id],
  }),
}));

export const productFilesRelations = relations(productFiles, ({ one }) => ({
  product: one(products, {
    fields: [productFiles.productId],
    references: [products.id],
  }),
}));
