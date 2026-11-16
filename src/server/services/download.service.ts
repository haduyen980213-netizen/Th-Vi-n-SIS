import crypto from 'node:crypto';
import fs from 'node:fs';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  categories,
  downloadEntitlements,
  downloadLogs,
  productFiles,
  products,
  sellers,
} from '../../db/schema.ts';
import { ensureVaultArchiveForProduct } from './zip.service.ts';

const SIGNED_URL_TTL_SECONDS = 120;

function getDownloadSigningSecret(): string {
  return (
    process.env.DOWNLOAD_SIGNING_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.SQL_PASSWORD ||
    'sis-dev-download-hmac-signing-key'
  );
}

interface SignedDownloadTokenPayload {
  uid: number;
  pid: number;
  fid: number;
  eid: number;
  exp: number;
  nonce: string;
}

export class DownloadError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 403) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function signTokenPayload(payload: SignedDownloadTokenPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getDownloadSigningSecret())
    .update(encoded)
    .digest('hex');
  return `${encoded}.${sig}`;
}

export function verifySignedDownloadToken(token: string): SignedDownloadTokenPayload {
  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new DownloadError('INVALID_SIGNED_URL', 'Liên kết tải xuống không hợp lệ.', 403);
  }
  const [encoded, sig] = parts;
  if (!encoded || !sig) {
    throw new DownloadError('INVALID_SIGNED_URL', 'Liên kết tải xuống không hợp lệ.', 403);
  }

  const expectedSig = crypto
    .createHmac('sha256', getDownloadSigningSecret())
    .update(encoded)
    .digest('hex');

  const bufA = Buffer.from(expectedSig, 'utf8');
  const bufB = Buffer.from(sig, 'utf8');
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    throw new DownloadError('INVALID_SIGNATURE', 'Chữ ký liên kết tải xuống không hợp lệ.', 403);
  }

  let payload: SignedDownloadTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new DownloadError('INVALID_SIGNED_URL', 'Dữ liệu liên kết tải xuống bị hỏng.', 403);
  }

  if (
    !Number.isInteger(payload.uid) ||
    !Number.isInteger(payload.pid) ||
    !Number.isInteger(payload.fid) ||
    !Number.isInteger(payload.eid) ||
    !Number.isFinite(payload.exp)
  ) {
    throw new DownloadError('INVALID_SIGNED_URL', 'Liên kết tải xuống thiếu tham số.', 403);
  }

  if (Date.now() > payload.exp) {
    throw new DownloadError(
      'SIGNED_URL_EXPIRED',
      'Liên kết tải xuống đã hết hạn (hiệu lực 120 giây). Vui lòng tạo liên kết mới.',
      403
    );
  }

  return payload;
}

export async function createSignedDownloadUrl(params: {
  userId: number;
  productId: number;
  fileId?: number;
}) {
  const [entitlement] = await db
    .select()
    .from(downloadEntitlements)
    .where(
      and(
        eq(downloadEntitlements.userId, params.userId),
        eq(downloadEntitlements.productId, params.productId)
      )
    )
    .limit(1);

  if (!entitlement) {
    throw new DownloadError(
      'NO_ENTITLEMENT',
      'Bạn chưa sở hữu quyền tải hồ sơ bản vẽ này. Vui lòng mua hoặc nhận tài liệu trước.',
      403
    );
  }

  if (entitlement.isRevoked) {
    throw new DownloadError(
      'ENTITLEMENT_REVOKED',
      'Quyền tải bản vẽ này đã bị thu hồi.',
      403
    );
  }

  if (entitlement.expiresAt && entitlement.expiresAt < new Date()) {
    throw new DownloadError(
      'ENTITLEMENT_EXPIRED',
      'Thời hạn tải bản vẽ đã kết thúc.',
      403
    );
  }

  if (entitlement.downloadsUsed >= entitlement.maxDownloads) {
    throw new DownloadError(
      'DOWNLOAD_LIMIT_REACHED',
      `Bạn đã sử dụng hết ${entitlement.maxDownloads} lượt tải cho hồ sơ này.`,
      403
    );
  }

  const files = await db
    .select()
    .from(productFiles)
    .where(eq(productFiles.productId, params.productId));

  if (files.length === 0) {
    throw new DownloadError('FILE_NOT_FOUND', 'Hồ sơ chưa có tệp đính kèm.', 404);
  }

  const targetFile = params.fileId
    ? files.find((f) => f.id === params.fileId)
    : files.find((f) => f.isPrimary) || files[0];

  if (!targetFile) {
    throw new DownloadError('FILE_NOT_FOUND', 'Không tìm thấy tệp tin được yêu cầu.', 404);
  }

  const token = signTokenPayload({
    uid: params.userId,
    pid: params.productId,
    fid: targetFile.id,
    eid: entitlement.id,
    exp: Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
    nonce: crypto.randomBytes(8).toString('hex'),
  });

  return {
    signedUrl: `/api/v1/downloads/file?token=${encodeURIComponent(token)}`,
    expiresInSeconds: SIGNED_URL_TTL_SECONDS,
    filename: targetFile.originalFilename,
    sizeBytes: targetFile.sizeBytes,
    downloadsRemaining: entitlement.maxDownloads - entitlement.downloadsUsed,
  };
}

export async function consumeSignedDownloadAndResolveFile(params: {
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const payload = verifySignedDownloadToken(params.token);
  const tokenHash = crypto.createHash('sha256').update(params.token).digest('hex');

  const resolved = await db.transaction(async (tx) => {
    const [entitlement] = await tx
      .select()
      .from(downloadEntitlements)
      .where(
        and(
          eq(downloadEntitlements.id, payload.eid),
          eq(downloadEntitlements.userId, payload.uid),
          eq(downloadEntitlements.productId, payload.pid)
        )
      )
      .for('update')
      .limit(1);

    if (!entitlement || entitlement.isRevoked) {
      throw new DownloadError('NO_ENTITLEMENT', 'Quyền tải không hợp lệ hoặc đã bị thu hồi.', 403);
    }

    if (entitlement.expiresAt && entitlement.expiresAt < new Date()) {
      throw new DownloadError('ENTITLEMENT_EXPIRED', 'Thời hạn tải đã hết.', 403);
    }

    if (entitlement.downloadsUsed >= entitlement.maxDownloads) {
      throw new DownloadError('DOWNLOAD_LIMIT_REACHED', 'Đã đạt giới hạn lượt tải.', 403);
    }

    const [fileRow] = await tx
      .select()
      .from(productFiles)
      .where(and(eq(productFiles.id, payload.fid), eq(productFiles.productId, payload.pid)))
      .limit(1);

    if (!fileRow) {
      throw new DownloadError('FILE_NOT_FOUND', 'Không tìm thấy tệp bản vẽ.', 404);
    }

    const [productRow] = await tx
      .select({
        id: products.id,
        code: products.code,
        title: products.title,
        summary: products.summary,
        fileFormat: products.fileFormat,
        softwareVersion: products.softwareVersion,
        pageOrSheetCount: products.pageOrSheetCount,
        categoryName: categories.name,
        sellerName: sellers.displayName,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .innerJoin(sellers, eq(products.sellerId, sellers.id))
      .where(eq(products.id, payload.pid))
      .limit(1);

    if (!productRow) {
      throw new DownloadError('PRODUCT_NOT_FOUND', 'Hồ sơ bản vẽ không tồn tại.', 404);
    }

    await tx
      .update(downloadEntitlements)
      .set({ downloadsUsed: sql`${downloadEntitlements.downloadsUsed} + 1` })
      .where(eq(downloadEntitlements.id, entitlement.id));

    await tx
      .update(products)
      .set({ downloadCount: sql`${products.downloadCount} + 1` })
      .where(eq(products.id, productRow.id));

    await tx.insert(downloadLogs).values({
      userId: payload.uid,
      productId: payload.pid,
      entitlementId: entitlement.id,
      fileId: fileRow.id,
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent ? params.userAgent.slice(0, 300) : null,
      signedUrlTokenHash: tokenHash,
    });

    return { fileRow, productRow };
  });

  const filePath = ensureVaultArchiveForProduct({
    storageKey: resolved.fileRow.storageKey,
    productCode: resolved.productRow.code,
    productTitle: resolved.productRow.title,
    categoryName: resolved.productRow.categoryName,
    fileFormat: resolved.productRow.fileFormat,
    softwareVersion: resolved.productRow.softwareVersion,
    pageOrSheetCount: resolved.productRow.pageOrSheetCount,
    sellerName: resolved.productRow.sellerName,
    summary: resolved.productRow.summary,
  });

  const fileStat = fs.statSync(filePath);

  return {
    filePath,
    filename: resolved.fileRow.originalFilename,
    mimeType: resolved.fileRow.mimeType || 'application/zip',
    sizeBytes: fileStat.size,
  };
}
