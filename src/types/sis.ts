export interface CategoryItem {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  iconName: string | null;
  sortOrder: number;
  productCount: number;
}

export interface ProductPricing {
  listedPriceVnd: number;
  effectivePriceVnd: number;
  priceSource: 'FREE' | 'ACCOUNT_CUSTOM' | 'LISTED';
  hasCustomPrice: boolean;
  discountPercent: number;
  customEndsAt: string | null;
}

export interface ProductSummary {
  id: number;
  code: string;
  slug: string;
  title: string;
  summary: string;
  fileFormat: string;
  softwareVersion: string | null;
  fileSizeLabel: string;
  pageOrSheetCount: number;
  thumbnailUrl: string;
  approvalStatus: string;
  isFeatured: boolean;
  isFree: boolean;
  viewCount: number;
  purchaseCount: number;
  downloadCount: number;
  ratingAvg: number;
  publishedAt: string;
  category: {
    id: number;
    name: string;
    slug: string;
  };
  seller: {
    id: number;
    displayName: string;
    slug: string;
  };
  pricing: ProductPricing;
}

export interface ProductDetail extends ProductSummary {
  description: string;
  seller: {
    id: number;
    displayName: string;
    slug: string;
    specialty: string | null;
  };
  images: Array<{
    id: number;
    imageUrl: string;
    caption: string | null;
    sortOrder: number;
  }>;
  files: Array<{
    id: number;
    originalFilename: string;
    sizeBytes: number;
    versionLabel: string;
  }>;
  versions: Array<{
    id: number;
    versionNumber: string;
    changelog: string | null;
    createdAt: string;
  }>;
  tags: Array<{
    name: string;
    slug: string;
  }>;
  isFavorited: boolean;
  hasEntitlement?: boolean;
  entitlement?: {
    id: number;
    maxDownloads: number;
    downloadsUsed: number;
    expiresAt: string | null;
    isRevoked: boolean;
  } | null;
}

export interface CheckoutResult {
  order: {
    id: number;
    orderCode: string;
    subtotalVnd: number;
    discountVnd: number;
    totalAmountVnd: number;
    status: string;
    paidAt: string | null;
    createdAt: string;
  };
  deduplicated: boolean;
}

export interface SignedDownloadResponse {
  signedUrl: string;
  expiresInSeconds: number;
  filename: string;
  sizeBytes: number;
  downloadsRemaining: number;
}

export interface AuthUser {
  id: number;
  uid: string;
  email: string;
  phone: string | null;
  fullName: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  status: string;
  roles: string[];
  permissions: string[];
}

export interface UserProfile {
  companyName: string | null;
  jobTitle: string | null;
  taxCode: string | null;
  address: string | null;
  city: string | null;
  bio: string | null;
}

export interface WalletSummary {
  availableBalanceVnd: number;
  pendingBalanceVnd: number;
  totalDepositedVnd: number;
  totalSpentVnd: number;
  currency: string;
}

export interface ReceivingBankInfo {
  bankCode: string;
  bankName: string;
  bankBin: string;
  accountNumber: string;
  accountName: string;
}

export interface TopupOrderRecord {
  id: number;
  topupCode: string;
  userId: number;
  requestedAmountVnd: number;
  receivedAmountVnd: number;
  qrPayloadUrl: string | null;
  bankAccountNumber: string | null;
  status: 'PENDING' | 'PAID' | 'UNDERPAID' | 'OVERPAID' | 'EXPIRED' | 'CANCELLED';
  expiresAt: string;
  paidAt: string | null;
  createdAt: string;
}

export interface WalletTransactionRecord {
  id: number;
  txCode: string;
  txType: string;
  direction: 'CREDIT' | 'DEBIT';
  amountVnd: number;
  balanceBeforeVnd: number;
  balanceAfterVnd: number;
  status: string;
  source: string;
  referenceCode: string | null;
  description: string;
  createdAt: string;
}

export interface CustomPriceRecord {
  id: number;
  userId: number;
  productId: number;
  customPriceVnd: number;
  startsAt: string | null;
  endsAt: string | null;
  note: string | null;
  isActive: boolean;
  updatedAt: string;
  userFullName: string;
  userEmail: string;
  userPhone: string | null;
  productCode: string;
  productSlug: string;
  productTitle: string;
  listedPriceVnd: number;
  fileFormat: string;
  thumbnailUrl: string;
}

export interface PriceChangeLogRecord {
  id: number;
  userId: number | null;
  productId: number;
  previousPriceVnd: number | null;
  newPriceVnd: number;
  priceType: string;
  reason: string | null;
  createdAt: string;
  productCode: string;
  productTitle: string;
  targetUser: { fullName: string; email: string } | null;
  actorUser: { fullName: string; email: string } | null;
}

export interface NotificationRecord {
  id: number;
  type: string;
  title: string;
  body: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface SellerProfileRecord {
  id: number;
  userId: number;
  displayName: string;
  slug: string;
  specialty: string | null;
  bio: string | null;
  verifiedStatus: string;
  commissionRateBps: number;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountHolder: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SellerBalanceRecord {
  id: number;
  sellerId: number;
  availableBalanceVnd: number;
  pendingBalanceVnd: number;
  totalEarnedVnd: number;
  totalWithdrawnVnd: number;
}

export interface SellerProductRecord {
  id: number;
  code: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  categoryId: number;
  categoryName: string;
  categorySlug: string;
  listedPriceVnd: number;
  isFree: boolean;
  fileFormat: string;
  softwareVersion: string | null;
  fileSizeBytes: number;
  fileSizeLabel: string;
  pageOrSheetCount: number;
  thumbnailUrl: string;
  approvalStatus: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'HIDDEN';
  rejectionReason: string | null;
  viewCount: number;
  purchaseCount: number;
  downloadCount: number;
  publishedAt: string | null;
  createdAt: string;
  files: Array<{
    id: number;
    originalFilename: string;
    sizeBytes: number;
    versionLabel: string;
    isPrimary: boolean;
    createdAt: string;
  }>;
  versions: Array<{
    id: number;
    versionNumber: string;
    changelog: string | null;
    createdAt: string;
  }>;
}

export interface SellerCommissionRecord {
  id: number;
  grossAmountVnd: number;
  commissionRateBps: number;
  sellerNetVnd: number;
  platformFeeVnd: number;
  status: string;
  availableAt: string | null;
  createdAt: string;
  orderCode: string;
  productCode: string;
  productTitle: string;
}

export interface SellerPayoutRecord {
  id: number;
  payoutCode: string;
  sellerId: number;
  amountVnd: number;
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
  status: 'PENDING' | 'PAID' | 'REJECTED';
  note: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface AdminModerationProductRecord {
  id: number;
  code: string;
  slug: string;
  title: string;
  listedPriceVnd: number;
  isFree: boolean;
  fileFormat: string;
  fileSizeLabel: string;
  approvalStatus: string;
  rejectionReason: string | null;
  createdAt: string;
  categoryName: string;
  sellerId: number;
  sellerName: string;
  sellerUserId: number;
}

export interface AdminSellerPayoutRecord extends SellerPayoutRecord {
  sellerName: string;
  sellerUserId: number;
  sellerEmail: string;
}

export interface AdminAnalyticsReport {
  summary: {
    totalUsers: number;
    totalSellers: number;
    approvedProducts: number;
    pendingProducts: number;
    openTickets: number;
    completedOrders: number;
    totalGmvVnd: number;
    platformFeeVnd: number;
    sellerNetTotalVnd: number;
    paidTopupCount: number;
    totalTopupPaidVnd: number;
  };
  topProducts: Array<{
    id: number;
    code: string;
    title: string;
    listedPriceVnd: number;
    isFree: boolean;
    viewCount: number;
    purchaseCount: number;
    downloadCount: number;
    categoryName: string;
  }>;
  dailySales: Array<{
    day: string;
    orderCount: number;
    revenueVnd: number;
  }>;
}

export interface AdminUserRecord {
  id: number;
  email: string;
  phone: string | null;
  fullName: string;
  status: 'ACTIVE' | 'LOCKED' | 'PENDING';
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  walletBalanceVnd: number;
  sellerDisplayName: string | null;
  roles: string[];
}

export interface RbacRoleRecord {
  id: number;
  code: string;
  name: string;
  description: string | null;
}

export interface CmsBannerRecord {
  id: number;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  targetUrl: string | null;
  position: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface AdminCategoryRecord {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface SiteSettingRecord {
  id: number;
  key: string;
  value: string;
  groupName: string;
  description: string | null;
  updatedAt: string;
}

export interface SupportTicketRecord {
  id: number;
  ticketCode: string;
  userId: number | null;
  contactName: string;
  contactEmail: string;
  subject: string;
  category: string;
  message: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
}

export interface AdminLogRecord {
  id: number;
  action: string;
  targetType: string;
  targetId: string | null;
  detailsJson: Record<string, any> | null;
  ipAddress: string | null;
  createdAt: string;
  actorEmail: string;
  actorName: string;
}

export interface AuditLogRecord {
  id: number;
  entityType: string;
  entityId: string;
  action: string;
  afterJson: Record<string, any> | null;
  ipAddress: string | null;
  createdAt: string;
  actorEmail: string | null;
  actorName: string | null;
}
