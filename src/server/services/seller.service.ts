import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  adminLogs,
  auditLogs,
  categories,
  notifications,
  orderItems,
  orders,
  payoutTransactions,
  productFiles,
  productImages,
  products,
  productVersions,
  roles,
  sellerBalances,
  sellerCommissions,
  sellerPayouts,
  sellerProducts,
  sellers,
  userRoles,
  users,
} from '../../db/schema.ts';
import { resolvePrivateVaultPath } from './zip.service.ts';

const PUBLIC_PREVIEW_DIR = process.env.VERCEL
  ? path.resolve('/tmp', 'sis-storage', 'public-previews')
  : path.resolve(process.cwd(), 'storage', 'public-previews');

const ALLOWED_DRAWING_EXTS = new Set([
  '.zip',
  '.rar',
  '.7z',
  '.dwg',
  '.dxf',
  '.rvt',
  '.rfa',
  '.skp',
  '.ifc',
  '.pdf',
  '.docx',
  '.xlsx',
  '.step',
  '.igs',
]);

const ALLOWED_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const FALLBACK_PREVIEW_IMAGES = new Set([
  '/src/assets/images/drawing_modern_villa_1794798219281.jpg',
  '/src/assets/images/drawing_townhouse_facade_1794798220506.jpg',
  '/src/assets/images/drawing_structural_bim_1794798220917.jpg',
  '/src/assets/images/drawing_interior_living_1794798220391.jpg',
  '/src/assets/images/drawing_mep_mechanical_1794798222346.jpg',
  '/src/assets/images/hero_sis_architecture_1794798218632.jpg',
]);

export class SellerError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function slugifyVietnamese(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

export function formatFileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function saveUploadedPreviewImage(file: {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
}): string {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_IMAGE_EXTS.has(ext)) {
    throw new SellerError(
      'INVALID_IMAGE_TYPE',
      'Ảnh xem trước chỉ hỗ trợ định dạng JPG, PNG hoặc WebP.',
      400
    );
  }
  fs.mkdirSync(PUBLIC_PREVIEW_DIR, { recursive: true });
  const filename = `preview-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  const fullPath = path.resolve(PUBLIC_PREVIEW_DIR, filename);
  fs.writeFileSync(fullPath, file.buffer);
  return `/uploads/previews/${filename}`;
}

function saveUploadedDrawingFile(
  productCode: string,
  file: { originalname: string; buffer: Buffer; mimetype: string }
) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_DRAWING_EXTS.has(ext)) {
    throw new SellerError(
      'INVALID_DRAWING_FILE',
      'Định dạng tệp bản vẽ không được hỗ trợ. Chấp nhận: ZIP, RAR, 7Z, DWG, DXF, RVT, RFA, SKP, IFC, PDF, DOCX, XLSX, STEP.',
      400
    );
  }
  const safeName = path
    .basename(file.originalname || `package${ext}`)
    .replace(/[^a-zA-Z0-9._-]/g, '_');
  const storageKey = `drawings/${productCode.toLowerCase()}/${Date.now()}-${crypto
    .randomBytes(3)
    .toString('hex')}-${safeName}`;
  const fullPath = resolvePrivateVaultPath(storageKey);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, file.buffer);

  const checksumSha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');

  return {
    storageKey,
    originalFilename: file.originalname || safeName,
    mimeType: file.mimetype || 'application/octet-stream',
    sizeBytes: file.buffer.length,
    checksumSha256,
  };
}

export async function getSellerByUserId(userId: number) {
  const [sellerRow] = await db
    .select()
    .from(sellers)
    .where(eq(sellers.userId, userId))
    .limit(1);

  if (!sellerRow) return null;

  await db.insert(sellerBalances).values({ sellerId: sellerRow.id }).onConflictDoNothing();
  const [balanceRow] = await db
    .select()
    .from(sellerBalances)
    .where(eq(sellerBalances.sellerId, sellerRow.id))
    .limit(1);

  return { seller: sellerRow, balance: balanceRow };
}

export async function registerOrUpdateSellerProfile(params: {
  userId: number;
  displayName: string;
  specialty?: string | null;
  bio?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountHolder?: string | null;
  ipAddress?: string | null;
}) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(sellers)
      .where(eq(sellers.userId, params.userId))
      .limit(1);

    let sellerRow;

    if (existing) {
      const [updated] = await tx
        .update(sellers)
        .set({
          displayName: params.displayName,
          specialty: params.specialty ?? existing.specialty,
          bio: params.bio ?? existing.bio,
          bankName: params.bankName !== undefined ? params.bankName : existing.bankName,
          bankAccountNumber:
            params.bankAccountNumber !== undefined
              ? params.bankAccountNumber
              : existing.bankAccountNumber,
          bankAccountHolder:
            params.bankAccountHolder !== undefined
              ? params.bankAccountHolder
              : existing.bankAccountHolder,
          updatedAt: new Date(),
        })
        .where(eq(sellers.id, existing.id))
        .returning();
      sellerRow = updated;
    } else {
      const baseSlug = slugifyVietnamese(params.displayName) || `seller-${params.userId}`;
      const uniqueSlug = `${baseSlug}-${params.userId}`;

      const [inserted] = await tx
        .insert(sellers)
        .values({
          userId: params.userId,
          displayName: params.displayName,
          slug: uniqueSlug,
          specialty: params.specialty ?? null,
          bio: params.bio ?? null,
          verifiedStatus: 'VERIFIED',
          commissionRateBps: 7000,
          bankName: params.bankName ?? null,
          bankAccountNumber: params.bankAccountNumber ?? null,
          bankAccountHolder: params.bankAccountHolder ?? null,
        })
        .returning();
      sellerRow = inserted;
    }

    await tx.insert(sellerBalances).values({ sellerId: sellerRow.id }).onConflictDoNothing();

    // Grant SELLER RBAC role while preserving MEMBER / ADMIN / etc.
    const [sellerRole] = await tx
      .select()
      .from(roles)
      .where(eq(roles.code, 'SELLER'))
      .limit(1);

    if (sellerRole) {
      await tx
        .insert(userRoles)
        .values({ userId: params.userId, roleId: sellerRole.id })
        .onConflictDoNothing();
    }

    await tx.insert(auditLogs).values({
      actorUserId: params.userId,
      entityType: 'SELLER',
      entityId: String(sellerRow.id),
      action: existing ? 'SELLER_PROFILE_UPDATED' : 'SELLER_ONBOARDED',
      afterJson: {
        displayName: sellerRow.displayName,
        bankName: sellerRow.bankName,
        bankAccountNumber: sellerRow.bankAccountNumber,
      },
      ipAddress: params.ipAddress || null,
    });

    const [balanceRow] = await tx
      .select()
      .from(sellerBalances)
      .where(eq(sellerBalances.sellerId, sellerRow.id))
      .limit(1);

    return { seller: sellerRow, balance: balanceRow };
  });
}

export async function listSellerProducts(sellerId: number) {
  const rows = await db
    .select({
      id: products.id,
      code: products.code,
      slug: products.slug,
      title: products.title,
      summary: products.summary,
      description: products.description,
      categoryId: products.categoryId,
      categoryName: categories.name,
      categorySlug: categories.slug,
      listedPriceVnd: products.listedPriceVnd,
      isFree: products.isFree,
      fileFormat: products.fileFormat,
      softwareVersion: products.softwareVersion,
      fileSizeBytes: products.fileSizeBytes,
      fileSizeLabel: products.fileSizeLabel,
      pageOrSheetCount: products.pageOrSheetCount,
      thumbnailUrl: products.thumbnailUrl,
      approvalStatus: products.approvalStatus,
      rejectionReason: products.rejectionReason,
      viewCount: products.viewCount,
      purchaseCount: products.purchaseCount,
      downloadCount: products.downloadCount,
      publishedAt: products.publishedAt,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.sellerId, sellerId), isNull(products.deletedAt)))
    .orderBy(desc(products.createdAt));

  if (rows.length === 0) return [];

  const fileRows = await db
    .select()
    .from(productFiles)
    .orderBy(desc(productFiles.createdAt));
  const versionRows = await db
    .select()
    .from(productVersions)
    .orderBy(desc(productVersions.createdAt));

  return rows.map((p) => ({
    ...p,
    files: fileRows
      .filter((f) => f.productId === p.id)
      .map((f) => ({
        id: f.id,
        originalFilename: f.originalFilename,
        sizeBytes: f.sizeBytes,
        versionLabel: f.versionLabel,
        isPrimary: f.isPrimary,
        createdAt: f.createdAt,
      })),
    versions: versionRows.filter((v) => v.productId === p.id),
  }));
}

export async function createSellerProduct(params: {
  userId: number;
  sellerId: number;
  title: string;
  summary: string;
  description: string;
  categoryId: number;
  listedPriceVnd: number;
  isFree: boolean;
  fileFormat: string;
  softwareVersion?: string | null;
  pageOrSheetCount: number;
  presetThumbnailUrl?: string | null;
  previewImageFile?: { originalname: string; buffer: Buffer; mimetype: string };
  drawingFile: { originalname: string; buffer: Buffer; mimetype: string };
  submitMode?: 'PENDING' | 'DRAFT';
  ipAddress?: string | null;
}) {
  const [catRow] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, params.categoryId))
    .limit(1);

  if (!catRow) {
    throw new SellerError('INVALID_CATEGORY', 'Danh mục bản vẽ không tồn tại.', 400);
  }

  const finalIsFree = Boolean(params.isFree || params.listedPriceVnd === 0);
  const finalPrice = finalIsFree ? 0 : Math.round(params.listedPriceVnd);
  if (!finalIsFree && finalPrice < 10_000) {
    throw new SellerError(
      'INVALID_PRICE',
      'Giá bán tối thiểu cho bản vẽ trả phí là 10.000 ₫ (hoặc chọn Miễn phí).',
      400
    );
  }

  const randHex = crypto.randomBytes(2).toString('hex').toUpperCase();
  const productCode = `SIS-${catRow.slug.slice(0, 2).toUpperCase()}-${Date.now()
    .toString()
    .slice(-4)}${randHex}`;
  const slugBase = slugifyVietnamese(params.title) || productCode.toLowerCase();
  const productSlug = `${slugBase}-${productCode.toLowerCase()}`;

  let thumbnailUrl =
    params.presetThumbnailUrl && FALLBACK_PREVIEW_IMAGES.has(params.presetThumbnailUrl)
      ? params.presetThumbnailUrl
      : '/src/assets/images/drawing_modern_villa_1794798219281.jpg';

  if (params.previewImageFile) {
    thumbnailUrl = saveUploadedPreviewImage(params.previewImageFile);
  }

  const savedFile = saveUploadedDrawingFile(productCode, params.drawingFile);
  const fileSizeLabel = formatFileSizeLabel(savedFile.sizeBytes);
  const approvalStatus = params.submitMode === 'DRAFT' ? 'DRAFT' : 'PENDING';

  return db.transaction(async (tx) => {
    const [createdProduct] = await tx
      .insert(products)
      .values({
        code: productCode,
        slug: productSlug,
        title: params.title,
        summary: params.summary,
        description: params.description,
        categoryId: catRow.id,
        sellerId: params.sellerId,
        listedPriceVnd: finalPrice,
        isFree: finalIsFree,
        fileFormat: params.fileFormat.toUpperCase(),
        softwareVersion: params.softwareVersion || null,
        fileSizeBytes: savedFile.sizeBytes,
        fileSizeLabel,
        pageOrSheetCount: Math.max(1, params.pageOrSheetCount),
        thumbnailUrl,
        approvalStatus,
      })
      .returning();

    await tx
      .insert(sellerProducts)
      .values({ sellerId: params.sellerId, productId: createdProduct.id })
      .onConflictDoNothing();

    await tx.insert(productImages).values({
      productId: createdProduct.id,
      imageUrl: thumbnailUrl,
      caption: `Ảnh đại diện — ${productCode}`,
      sortOrder: 1,
    });

    const [createdFile] = await tx
      .insert(productFiles)
      .values({
        productId: createdProduct.id,
        storageBucket: 'sis-private-vault',
        storageKey: savedFile.storageKey,
        originalFilename: savedFile.originalFilename,
        mimeType: savedFile.mimeType,
        checksumSha256: savedFile.checksumSha256,
        sizeBytes: savedFile.sizeBytes,
        versionLabel: 'v1.0',
        isPrimary: true,
      })
      .returning();

    await tx.insert(productVersions).values({
      productId: createdProduct.id,
      versionNumber: 'v1.0',
      changelog: 'Phát hành hồ sơ bản vẽ ban đầu từ Kênh Người bán.',
      fileId: createdFile.id,
      createdBy: params.userId,
    });

    await tx.insert(auditLogs).values({
      actorUserId: params.userId,
      entityType: 'PRODUCT',
      entityId: String(createdProduct.id),
      action: 'SELLER_PRODUCT_CREATED',
      afterJson: {
        code: productCode,
        listedPriceVnd: finalPrice,
        approvalStatus,
        sizeBytes: savedFile.sizeBytes,
      },
      ipAddress: params.ipAddress || null,
    });

    return createdProduct;
  });
}

export async function updateSellerProduct(params: {
  userId: number;
  sellerId: number;
  productId: number;
  title?: string;
  summary?: string;
  description?: string;
  categoryId?: number;
  listedPriceVnd?: number;
  isFree?: boolean;
  fileFormat?: string;
  softwareVersion?: string | null;
  pageOrSheetCount?: number;
  approvalStatus?: 'APPROVED' | 'DRAFT' | 'PENDING' | 'HIDDEN';
  allowDirectApprove?: boolean;
  ipAddress?: string | null;
}) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(products)
      .where(
        and(
          eq(products.id, params.productId),
          eq(products.sellerId, params.sellerId),
          isNull(products.deletedAt)
        )
      )
      .limit(1);

    if (!existing) {
      throw new SellerError('PRODUCT_NOT_FOUND', 'Không tìm thấy bản vẽ thuộc quyền quản lý của bạn.', 404);
    }

    let nextIsFree = existing.isFree;
    if (params.isFree !== undefined) {
      nextIsFree = params.isFree;
    } else if (params.listedPriceVnd !== undefined) {
      nextIsFree = params.listedPriceVnd <= 0;
    }

    const nextPrice = nextIsFree
      ? 0
      : params.listedPriceVnd !== undefined
      ? Math.round(params.listedPriceVnd)
      : existing.listedPriceVnd;

    if (!nextIsFree && nextPrice < 10_000) {
      throw new SellerError('INVALID_PRICE', 'Giá bán tối thiểu là 10.000 ₫ (hoặc Miễn phí).', 400);
    }

    let nextStatus = existing.approvalStatus;
    if (params.approvalStatus) {
      if (
        params.approvalStatus === 'APPROVED' &&
        (existing.approvalStatus === 'APPROVED' || params.allowDirectApprove)
      ) {
        nextStatus = 'APPROVED';
      } else if (
        params.approvalStatus === 'HIDDEN' &&
        (existing.approvalStatus === 'APPROVED' || existing.approvalStatus === 'HIDDEN')
      ) {
        nextStatus = 'HIDDEN';
      } else if (params.approvalStatus === 'PENDING') {
        nextStatus = 'PENDING';
      } else if (params.approvalStatus === 'DRAFT' && existing.approvalStatus !== 'APPROVED') {
        nextStatus = 'DRAFT';
      }
    }

    const [updated] = await tx
      .update(products)
      .set({
        ...(params.title ? { title: params.title } : {}),
        ...(params.summary ? { summary: params.summary } : {}),
        ...(params.description ? { description: params.description } : {}),
        ...(params.categoryId ? { categoryId: params.categoryId } : {}),
        listedPriceVnd: nextPrice,
        isFree: nextIsFree,
        ...(params.fileFormat ? { fileFormat: params.fileFormat.toUpperCase() } : {}),
        ...(params.softwareVersion !== undefined
          ? { softwareVersion: params.softwareVersion }
          : {}),
        ...(params.pageOrSheetCount ? { pageOrSheetCount: params.pageOrSheetCount } : {}),
        approvalStatus: nextStatus,
        ...(nextStatus === 'APPROVED' && !existing.publishedAt ? { publishedAt: new Date() } : {}),
        ...(nextStatus === 'PENDING' || nextStatus === 'APPROVED' ? { rejectionReason: null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(products.id, existing.id))
      .returning();

    await tx.insert(auditLogs).values({
      actorUserId: params.userId,
      entityType: 'PRODUCT',
      entityId: String(existing.id),
      action: 'SELLER_PRODUCT_UPDATED',
      beforeJson: {
        listedPriceVnd: existing.listedPriceVnd,
        approvalStatus: existing.approvalStatus,
      },
      afterJson: {
        listedPriceVnd: updated.listedPriceVnd,
        approvalStatus: updated.approvalStatus,
      },
      ipAddress: params.ipAddress || null,
    });

    return updated;
  });
}

export async function publishSellerProductVersion(params: {
  userId: number;
  sellerId: number;
  productId: number;
  versionNumber: string;
  changelog: string;
  drawingFile: { originalname: string; buffer: Buffer; mimetype: string };
  ipAddress?: string | null;
}) {
  const [existing] = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.id, params.productId),
        eq(products.sellerId, params.sellerId),
        isNull(products.deletedAt)
      )
    )
    .limit(1);

  if (!existing) {
    throw new SellerError('PRODUCT_NOT_FOUND', 'Không tìm thấy bản vẽ thuộc sở hữu của bạn.', 404);
  }

  const savedFile = saveUploadedDrawingFile(existing.code, params.drawingFile);
  const fileSizeLabel = formatFileSizeLabel(savedFile.sizeBytes);

  return db.transaction(async (tx) => {
    await tx
      .update(productFiles)
      .set({ isPrimary: false })
      .where(eq(productFiles.productId, existing.id));

    const [newFile] = await tx
      .insert(productFiles)
      .values({
        productId: existing.id,
        storageBucket: 'sis-private-vault',
        storageKey: savedFile.storageKey,
        originalFilename: savedFile.originalFilename,
        mimeType: savedFile.mimeType,
        checksumSha256: savedFile.checksumSha256,
        sizeBytes: savedFile.sizeBytes,
        versionLabel: params.versionNumber,
        isPrimary: true,
      })
      .returning();

    const [versionRow] = await tx
      .insert(productVersions)
      .values({
        productId: existing.id,
        versionNumber: params.versionNumber,
        changelog: params.changelog,
        fileId: newFile.id,
        createdBy: params.userId,
      })
      .returning();

    await tx
      .update(products)
      .set({
        fileSizeBytes: savedFile.sizeBytes,
        fileSizeLabel,
        updatedAt: new Date(),
      })
      .where(eq(products.id, existing.id));

    await tx.insert(auditLogs).values({
      actorUserId: params.userId,
      entityType: 'PRODUCT_VERSION',
      entityId: String(versionRow.id),
      action: 'VERSION_PUBLISHED',
      afterJson: {
        productId: existing.id,
        versionNumber: params.versionNumber,
        filename: savedFile.originalFilename,
      },
      ipAddress: params.ipAddress || null,
    });

    return { version: versionRow, file: newFile };
  });
}

export async function getSellerRevenueAndPayouts(sellerId: number) {
  await db.insert(sellerBalances).values({ sellerId }).onConflictDoNothing();

  const [balance] = await db
    .select()
    .from(sellerBalances)
    .where(eq(sellerBalances.sellerId, sellerId))
    .limit(1);

  const commissions = await db
    .select({
      id: sellerCommissions.id,
      grossAmountVnd: sellerCommissions.grossAmountVnd,
      commissionRateBps: sellerCommissions.commissionRateBps,
      sellerNetVnd: sellerCommissions.sellerNetVnd,
      platformFeeVnd: sellerCommissions.platformFeeVnd,
      status: sellerCommissions.status,
      availableAt: sellerCommissions.availableAt,
      createdAt: sellerCommissions.createdAt,
      orderCode: orders.orderCode,
      productCode: products.code,
      productTitle: products.title,
    })
    .from(sellerCommissions)
    .innerJoin(orderItems, eq(sellerCommissions.orderItemId, orderItems.id))
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(eq(sellerCommissions.sellerId, sellerId))
    .orderBy(desc(sellerCommissions.createdAt))
    .limit(100);

  const payouts = await db
    .select()
    .from(sellerPayouts)
    .where(eq(sellerPayouts.sellerId, sellerId))
    .orderBy(desc(sellerPayouts.createdAt))
    .limit(50);

  return { balance, commissions, payouts };
}

export async function createSellerPayoutRequest(params: {
  userId: number;
  sellerId: number;
  amountVnd: number;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
  note?: string | null;
  ipAddress?: string | null;
}) {
  if (!Number.isInteger(params.amountVnd) || params.amountVnd < 50_000) {
    throw new SellerError('INVALID_PAYOUT_AMOUNT', 'Số tiền rút tối thiểu là 50.000 ₫.', 400);
  }

  return db.transaction(async (tx) => {
    const [sellerRow] = await tx
      .select()
      .from(sellers)
      .where(eq(sellers.id, params.sellerId))
      .limit(1);

    if (!sellerRow) {
      throw new SellerError('SELLER_NOT_FOUND', 'Không tìm thấy hồ sơ Người bán.', 404);
    }

    const bankName = (params.bankName || sellerRow.bankName || '').trim();
    const bankAccountNumber = (params.bankAccountNumber || sellerRow.bankAccountNumber || '').trim();
    const bankAccountHolder = (params.bankAccountHolder || sellerRow.bankAccountHolder || '').trim();

    if (!bankName || !bankAccountNumber || !bankAccountHolder) {
      throw new SellerError(
        'MISSING_BANK_INFO',
        'Vui lòng cập nhật đầy đủ tên ngân hàng, số tài khoản và tên chủ tài khoản nhận rút tiền.',
        400
      );
    }

    await tx.insert(sellerBalances).values({ sellerId: params.sellerId }).onConflictDoNothing();

    const [bal] = await tx
      .select()
      .from(sellerBalances)
      .where(eq(sellerBalances.sellerId, params.sellerId))
      .for('update')
      .limit(1);

    if (!bal || bal.availableBalanceVnd < params.amountVnd) {
      throw new SellerError(
        'INSUFFICIENT_SELLER_BALANCE',
        `Số dư khả dụng của Người bán (${new Intl.NumberFormat('vi-VN').format(
          bal?.availableBalanceVnd ?? 0
        )} ₫) không đủ để rút ${new Intl.NumberFormat('vi-VN').format(params.amountVnd)} ₫.`,
        400
      );
    }

    await tx
      .update(sellerBalances)
      .set({
        availableBalanceVnd: bal.availableBalanceVnd - params.amountVnd,
        updatedAt: new Date(),
      })
      .where(eq(sellerBalances.id, bal.id));

    const payoutCode = `PO-${Date.now().toString().slice(-6)}-${crypto
      .randomBytes(2)
      .toString('hex')
      .toUpperCase()}`;

    const [payout] = await tx
      .insert(sellerPayouts)
      .values({
        payoutCode,
        sellerId: params.sellerId,
        amountVnd: params.amountVnd,
        bankName,
        bankAccountNumber,
        bankAccountHolder,
        status: 'PENDING',
        note: params.note || null,
      })
      .returning();

    await tx.insert(notifications).values({
      userId: params.userId,
      type: 'WALLET',
      title: `Đã tiếp nhận yêu cầu rút tiền ${payoutCode}`,
      body: `Yêu cầu rút ${new Intl.NumberFormat('vi-VN').format(
        params.amountVnd
      )} ₫ về ${bankName} (${bankAccountNumber}) đang chờ kế toán duyệt chi.`,
      linkUrl: '/tai-khoan?tab=seller',
    });

    await tx.insert(auditLogs).values({
      actorUserId: params.userId,
      entityType: 'SELLER_PAYOUT',
      entityId: String(payout.id),
      action: 'PAYOUT_REQUESTED',
      afterJson: {
        payoutCode,
        amountVnd: params.amountVnd,
        bankName,
        bankAccountNumber,
      },
      ipAddress: params.ipAddress || null,
    });

    return payout;
  });
}

// ============================================================================
// ADMIN / MODERATOR / ACCOUNTANT WORKFLOWS FOR SELLER MARKETPLACE
// ============================================================================

export async function listProductsForModeration(statusFilter?: string) {
  const rows = await db
    .select({
      id: products.id,
      code: products.code,
      slug: products.slug,
      title: products.title,
      listedPriceVnd: products.listedPriceVnd,
      isFree: products.isFree,
      fileFormat: products.fileFormat,
      fileSizeLabel: products.fileSizeLabel,
      approvalStatus: products.approvalStatus,
      rejectionReason: products.rejectionReason,
      createdAt: products.createdAt,
      categoryName: categories.name,
      sellerId: sellers.id,
      sellerName: sellers.displayName,
      sellerUserId: sellers.userId,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .innerJoin(sellers, eq(products.sellerId, sellers.id))
    .where(
      statusFilter && statusFilter !== 'ALL'
        ? and(eq(products.approvalStatus, statusFilter), isNull(products.deletedAt))
        : isNull(products.deletedAt)
    )
    .orderBy(desc(products.createdAt))
    .limit(60);

  return rows;
}

export async function moderateSellerProduct(params: {
  moderatorUserId: number;
  productId: number;
  decision: 'APPROVED' | 'REJECTED';
  rejectionReason?: string | null;
  ipAddress?: string | null;
}) {
  if (params.decision === 'REJECTED' && !params.rejectionReason?.trim()) {
    throw new SellerError('MISSING_REASON', 'Vui lòng nhập lý do khi từ chối hồ sơ bản vẽ.', 400);
  }

  return db.transaction(async (tx) => {
    const [prod] = await tx
      .select({
        id: products.id,
        code: products.code,
        title: products.title,
        approvalStatus: products.approvalStatus,
        sellerUserId: sellers.userId,
      })
      .from(products)
      .innerJoin(sellers, eq(products.sellerId, sellers.id))
      .where(eq(products.id, params.productId))
      .limit(1);

    if (!prod) {
      throw new SellerError('PRODUCT_NOT_FOUND', 'Không tìm thấy bản vẽ.', 404);
    }

    const [updated] = await tx
      .update(products)
      .set({
        approvalStatus: params.decision,
        rejectionReason: params.decision === 'REJECTED' ? params.rejectionReason!.trim() : null,
        publishedAt: params.decision === 'APPROVED' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(products.id, prod.id))
      .returning();

    await tx.insert(notifications).values({
      userId: prod.sellerUserId,
      type: 'APPROVAL',
      title:
        params.decision === 'APPROVED'
          ? `Bản vẽ ${prod.code} đã được duyệt phát hành`
          : `Bản vẽ ${prod.code} bị từ chối kiểm duyệt`,
      body:
        params.decision === 'APPROVED'
          ? `Hồ sơ "${prod.title}" đã xuất hiện trên thư viện THƯ VIỆN SIS.`
          : `Hồ sơ "${prod.title}" cần chỉnh sửa: ${params.rejectionReason}`,
      linkUrl: '/tai-khoan?tab=seller',
    });

    await tx.insert(adminLogs).values({
      adminUserId: params.moderatorUserId,
      action: params.decision === 'APPROVED' ? 'PRODUCT_APPROVED' : 'PRODUCT_REJECTED',
      targetType: 'PRODUCT',
      targetId: String(prod.id),
      detailsJson: {
        code: prod.code,
        previousStatus: prod.approvalStatus,
        rejectionReason: params.rejectionReason || null,
      },
      ipAddress: params.ipAddress || null,
    });

    return updated;
  });
}

export async function settlePendingSellerCommissions(params: {
  adminUserId: number;
  sellerId?: number;
  ipAddress?: string | null;
}) {
  return db.transaction(async (tx) => {
    const pendingRows = await tx
      .select()
      .from(sellerCommissions)
      .where(
        params.sellerId
          ? and(
              eq(sellerCommissions.status, 'PENDING'),
              eq(sellerCommissions.sellerId, params.sellerId)
            )
          : eq(sellerCommissions.status, 'PENDING')
      )
      .for('update');

    if (pendingRows.length === 0) {
      return { settledCount: 0, totalReleasedVnd: 0 };
    }

    const totalsBySeller = new Map<number, number>();
    for (const row of pendingRows) {
      totalsBySeller.set(
        row.sellerId,
        (totalsBySeller.get(row.sellerId) || 0) + row.sellerNetVnd
      );
      await tx
        .update(sellerCommissions)
        .set({ status: 'AVAILABLE' })
        .where(eq(sellerCommissions.id, row.id));
    }

    let totalReleasedVnd = 0;
    for (const [sId, amount] of totalsBySeller.entries()) {
      totalReleasedVnd += amount;
      const [bal] = await tx
        .select()
        .from(sellerBalances)
        .where(eq(sellerBalances.sellerId, sId))
        .for('update')
        .limit(1);

      if (bal) {
        const deductPending = Math.min(bal.pendingBalanceVnd, amount);
        await tx
          .update(sellerBalances)
          .set({
            pendingBalanceVnd: bal.pendingBalanceVnd - deductPending,
            availableBalanceVnd: bal.availableBalanceVnd + amount,
            updatedAt: new Date(),
          })
          .where(eq(sellerBalances.id, bal.id));
      }
    }

    await tx.insert(adminLogs).values({
      adminUserId: params.adminUserId,
      action: 'SETTLE_SELLER_COMMISSIONS',
      targetType: 'SELLER_COMMISSION',
      targetId: params.sellerId ? String(params.sellerId) : 'ALL',
      detailsJson: { settledCount: pendingRows.length, totalReleasedVnd },
      ipAddress: params.ipAddress || null,
    });

    return { settledCount: pendingRows.length, totalReleasedVnd };
  });
}

export async function listSellerPayoutsForAdmin() {
  return db
    .select({
      id: sellerPayouts.id,
      payoutCode: sellerPayouts.payoutCode,
      sellerId: sellerPayouts.sellerId,
      amountVnd: sellerPayouts.amountVnd,
      bankName: sellerPayouts.bankName,
      bankAccountNumber: sellerPayouts.bankAccountNumber,
      bankAccountHolder: sellerPayouts.bankAccountHolder,
      status: sellerPayouts.status,
      note: sellerPayouts.note,
      reviewedAt: sellerPayouts.reviewedAt,
      createdAt: sellerPayouts.createdAt,
      sellerName: sellers.displayName,
      sellerUserId: sellers.userId,
      sellerEmail: users.email,
    })
    .from(sellerPayouts)
    .innerJoin(sellers, eq(sellerPayouts.sellerId, sellers.id))
    .innerJoin(users, eq(sellers.userId, users.id))
    .orderBy(desc(sellerPayouts.createdAt))
    .limit(60);
}

export async function processSellerPayoutByAdmin(params: {
  adminUserId: number;
  payoutId: number;
  action: 'PAY' | 'REJECT';
  bankRefCode?: string;
  note?: string;
  ipAddress?: string | null;
}) {
  if (params.action === 'PAY' && !params.bankRefCode?.trim()) {
    throw new SellerError('MISSING_BANK_REF', 'Vui lòng nhập mã giao dịch chuyển khoản ngân hàng.', 400);
  }

  return db.transaction(async (tx) => {
    const [payout] = await tx
      .select()
      .from(sellerPayouts)
      .where(eq(sellerPayouts.id, params.payoutId))
      .for('update')
      .limit(1);

    if (!payout) {
      throw new SellerError('PAYOUT_NOT_FOUND', 'Không tìm thấy yêu cầu rút tiền.', 404);
    }
    if (payout.status !== 'PENDING') {
      throw new SellerError('ALREADY_PROCESSED', 'Yêu cầu rút tiền này đã được xử lý trước đó.', 400);
    }

    const [sellerRow] = await tx
      .select()
      .from(sellers)
      .where(eq(sellers.id, payout.sellerId))
      .limit(1);

    if (params.action === 'PAY') {
      const [updated] = await tx
        .update(sellerPayouts)
        .set({
          status: 'PAID',
          reviewedBy: params.adminUserId,
          reviewedAt: new Date(),
          note: params.note || payout.note,
        })
        .where(eq(sellerPayouts.id, payout.id))
        .returning();

      await tx.insert(payoutTransactions).values({
        payoutId: payout.id,
        bankRefCode: params.bankRefCode!.trim(),
        amountVnd: payout.amountVnd,
        executedBy: params.adminUserId,
      });

      await tx
        .update(sellerBalances)
        .set({
          totalWithdrawnVnd: sql`${sellerBalances.totalWithdrawnVnd} + ${payout.amountVnd}`,
          updatedAt: new Date(),
        })
        .where(eq(sellerBalances.sellerId, payout.sellerId));

      if (sellerRow) {
        await tx.insert(notifications).values({
          userId: sellerRow.userId,
          type: 'WALLET',
          title: `Chi trả thành công ${payout.payoutCode}`,
          body: `Số tiền ${new Intl.NumberFormat('vi-VN').format(
            payout.amountVnd
          )} ₫ đã được chuyển tới ${payout.bankName} (${payout.bankAccountNumber}) · Ref: ${params.bankRefCode}.`,
          linkUrl: '/tai-khoan?tab=seller',
        });
      }

      await tx.insert(adminLogs).values({
        adminUserId: params.adminUserId,
        action: 'SELLER_PAYOUT_PAID',
        targetType: 'SELLER_PAYOUT',
        targetId: payout.payoutCode,
        detailsJson: { amountVnd: payout.amountVnd, bankRefCode: params.bankRefCode },
        ipAddress: params.ipAddress || null,
      });

      return updated;
    } else {
      // Refund reserved amount back to availableBalanceVnd
      const [updated] = await tx
        .update(sellerPayouts)
        .set({
          status: 'REJECTED',
          reviewedBy: params.adminUserId,
          reviewedAt: new Date(),
          note: params.note || 'Kế toán từ chối yêu cầu rút tiền',
        })
        .where(eq(sellerPayouts.id, payout.id))
        .returning();

      await tx
        .update(sellerBalances)
        .set({
          availableBalanceVnd: sql`${sellerBalances.availableBalanceVnd} + ${payout.amountVnd}`,
          updatedAt: new Date(),
        })
        .where(eq(sellerBalances.sellerId, payout.sellerId));

      if (sellerRow) {
        await tx.insert(notifications).values({
          userId: sellerRow.userId,
          type: 'WALLET',
          title: `Yêu cầu rút tiền ${payout.payoutCode} bị từ chối`,
          body: `Số tiền ${new Intl.NumberFormat('vi-VN').format(
            payout.amountVnd
          )} ₫ đã được hoàn trả về số dư khả dụng Người bán. Lý do: ${params.note || 'Cần kiểm tra lại thông tin tài khoản'}.`,
          linkUrl: '/tai-khoan?tab=seller',
        });
      }

      await tx.insert(adminLogs).values({
        adminUserId: params.adminUserId,
        action: 'SELLER_PAYOUT_REJECTED',
        targetType: 'SELLER_PAYOUT',
        targetId: payout.payoutCode,
        detailsJson: { amountVnd: payout.amountVnd, reason: params.note || null },
        ipAddress: params.ipAddress || null,
      });

      return updated;
    }
  });
}
