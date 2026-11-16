import crypto from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  adminLogs,
  auditLogs,
  notifications,
  paymentProviders,
  paymentReconciliations,
  paymentWebhooks,
  topupOrders,
  wallets,
  walletTransactions,
} from '../../db/schema.ts';
import { buildVietQrPayload } from './vietqr.service.ts';

export interface ReceivingBankConfig {
  providerId: number;
  providerCode: string;
  bankCode: string;
  bankName: string;
  bankBin: string;
  accountNumber: string;
  accountName: string;
}

export async function getActiveReceivingBankConfig(): Promise<ReceivingBankConfig> {
  const [provider] = await db
    .select()
    .from(paymentProviders)
    .where(and(eq(paymentProviders.code, 'VIETQR_SHB'), eq(paymentProviders.isActive, true)))
    .limit(1);

  if (provider && provider.configJson && typeof provider.configJson === 'object') {
    const cfg = provider.configJson as Record<string, any>;
    return {
      providerId: provider.id,
      providerCode: provider.code,
      bankCode: String(cfg.bankCode || 'SHB'),
      bankName: String(cfg.bankName || 'Ngân hàng TMCP Sài Gòn - Hà Nội (SHB)'),
      bankBin: String(process.env.VIETQR_BANK_BIN || cfg.bankBin || '970443'),
      accountNumber: String(process.env.VIETQR_ACCOUNT_NO || cfg.accountNumber || '0946265256'),
      accountName: String(process.env.VIETQR_ACCOUNT_NAME || cfg.accountName || 'THU VIEN SIS'),
    };
  }

  // Ensure provider row exists in DB if accessed directly before full seed
  const [inserted] = await db
    .insert(paymentProviders)
    .values({
      code: 'VIETQR_SHB',
      name: 'Chuyển khoản nhanh VietQR SHB',
      isActive: true,
      configJson: {
        bankCode: 'SHB',
        bankName: 'Ngân hàng TMCP Sài Gòn - Hà Nội (SHB)',
        bankBin: process.env.VIETQR_BANK_BIN || '970443',
        accountNumber: process.env.VIETQR_ACCOUNT_NO || '0946265256',
        accountName: process.env.VIETQR_ACCOUNT_NAME || 'THU VIEN SIS',
      },
    })
    .onConflictDoUpdate({
      target: paymentProviders.code,
      set: { isActive: true },
    })
    .returning();

  const cfg = (inserted.configJson || {}) as Record<string, any>;
  return {
    providerId: inserted.id,
    providerCode: inserted.code,
    bankCode: String(cfg.bankCode || 'SHB'),
    bankName: String(cfg.bankName || 'Ngân hàng TMCP Sài Gòn - Hà Nội (SHB)'),
    bankBin: String(cfg.bankBin || '970443'),
    accountNumber: String(cfg.accountNumber || '0946265256'),
    accountName: String(cfg.accountName || 'THU VIEN SIS'),
  };
}

export function generateTopupCode(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `SISNAP${yy}${mm}${dd}${rand}`;
}

export async function createQuickQrTopupOrder(userId: number, amountVnd: number) {
  const bank = await getActiveReceivingBankConfig();
  const topupCode = generateTopupCode();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

  const emvQrString = buildVietQrPayload({
    bankBin: bank.bankBin,
    accountNumber: bank.accountNumber,
    amountVnd,
    transferContent: topupCode,
  });

  const [order] = await db
    .insert(topupOrders)
    .values({
      topupCode,
      userId,
      providerId: bank.providerId,
      requestedAmountVnd: amountVnd,
      receivedAmountVnd: 0,
      qrPayloadUrl: emvQrString,
      bankAccountNumber: bank.accountNumber,
      status: 'PENDING',
      expiresAt,
    })
    .returning();

  return { order, bank };
}

export function verifyWebhookHmacSignature(rawPayloadStr: string, signatureHeader?: string): boolean {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) {
    return false;
  }
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawPayloadStr)
    .digest('hex');

  const cleanHeader = signatureHeader.replace(/^sha256=/i, '').trim();
  const bufA = Buffer.from(expected, 'utf8');
  const bufB = Buffer.from(cleanHeader, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function creditWalletAtomic(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  params: {
    userId: number;
    amountVnd: number;
    txType: 'TOPUP' | 'REFUND' | 'ADMIN_ADJUST';
    source: string;
    referenceCode: string;
    description: string;
    idempotencyKey: string;
  }
) {
  if (params.amountVnd <= 0) {
    throw new Error('Số tiền cộng ví phải lớn hơn 0 VND.');
  }

  // Check idempotency inside transaction
  const [existingTx] = await tx
    .select()
    .from(walletTransactions)
    .where(eq(walletTransactions.idempotencyKey, params.idempotencyKey))
    .limit(1);

  if (existingTx) {
    return { alreadyProcessed: true, txRecord: existingTx };
  }

  // Ensure wallet exists
  await tx.insert(wallets).values({ userId: params.userId }).onConflictDoNothing();

  // Lock wallet row for update
  const [walletRow] = await tx
    .select()
    .from(wallets)
    .where(eq(wallets.userId, params.userId))
    .for('update')
    .limit(1);

  if (!walletRow) {
    throw new Error('Không tìm thấy ví người dùng.');
  }

  const balanceBefore = walletRow.availableBalanceVnd;
  const balanceAfter = balanceBefore + params.amountVnd;

  await tx
    .update(wallets)
    .set({
      availableBalanceVnd: balanceAfter,
      totalDepositedVnd:
        params.txType === 'TOPUP'
          ? walletRow.totalDepositedVnd + params.amountVnd
          : walletRow.totalDepositedVnd,
      version: sql`${wallets.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(wallets.id, walletRow.id), eq(wallets.version, walletRow.version)));

  const txCode = `TX-${Date.now().toString().slice(-6)}-${crypto
    .randomBytes(2)
    .toString('hex')
    .toUpperCase()}`;

  const [ledgerRow] = await tx
    .insert(walletTransactions)
    .values({
      txCode,
      walletId: walletRow.id,
      userId: params.userId,
      txType: params.txType,
      direction: 'CREDIT',
      amountVnd: params.amountVnd,
      balanceBeforeVnd: balanceBefore,
      balanceAfterVnd: balanceAfter,
      status: 'COMPLETED',
      source: params.source,
      referenceCode: params.referenceCode,
      description: params.description,
      idempotencyKey: params.idempotencyKey,
    })
    .returning();

  await tx.insert(notifications).values({
    userId: params.userId,
    type: 'WALLET',
    title: `Nạp tiền thành công +${new Intl.NumberFormat('vi-VN').format(params.amountVnd)} ₫`,
    body: `Giao dịch ${params.referenceCode} đã được ghi có vào ví THƯ VIỆN SIS. Số dư khả dụng hiện tại: ${new Intl.NumberFormat('vi-VN').format(balanceAfter)} ₫.`,
    linkUrl: '/tai-khoan?tab=wallet',
  });

  return { alreadyProcessed: false, txRecord: ledgerRow };
}

export async function processBankWebhookEvent(params: {
  providerCode: string;
  externalTxId: string;
  transferContent: string;
  amountVnd: number;
  targetAccountNumber: string;
  signatureValid: boolean;
  rawPayload: unknown;
}) {
  const bank = await getActiveReceivingBankConfig();

  return db.transaction(async (tx) => {
    // 1. Idempotency check on (providerCode, externalTxId)
    const insertedWebhooks = await tx
      .insert(paymentWebhooks)
      .values({
        providerCode: params.providerCode,
        externalTxId: params.externalTxId,
        signatureValid: params.signatureValid,
        rawPayload: params.rawPayload as Record<string, unknown>,
        processingStatus: 'RECEIVED',
      })
      .onConflictDoNothing({
        target: [paymentWebhooks.providerCode, paymentWebhooks.externalTxId],
      })
      .returning();

    if (insertedWebhooks.length === 0) {
      return { status: 'DUPLICATE', message: 'Webhook giao dịch này đã được xử lý trước đó.' };
    }

    const webhookRow = insertedWebhooks[0];

    if (!params.signatureValid) {
      await tx
        .update(paymentWebhooks)
        .set({
          processingStatus: 'FAILED',
          errorMessage: 'Invalid HMAC signature',
          processedAt: new Date(),
        })
        .where(eq(paymentWebhooks.id, webhookRow.id));
      return { status: 'INVALID_SIGNATURE', message: 'Chữ ký webhook không hợp lệ.' };
    }

    if (params.targetAccountNumber && params.targetAccountNumber !== bank.accountNumber) {
      await tx
        .update(paymentWebhooks)
        .set({
          processingStatus: 'IGNORED',
          errorMessage: `Target account mismatch: ${params.targetAccountNumber}`,
          processedAt: new Date(),
        })
        .where(eq(paymentWebhooks.id, webhookRow.id));
      return { status: 'IGNORED', message: 'Số tài khoản nhận không khớp cấu hình.' };
    }

    // Extract SISNAP code from bank transfer memo
    const match = params.transferContent.toUpperCase().match(/SISNAP[A-Z0-9]{6,20}/);
    if (!match) {
      await tx.insert(paymentReconciliations).values({
        webhookId: webhookRow.id,
        discrepancyType: 'UNIDENTIFIED',
        expectedAmountVnd: 0,
        actualAmountVnd: params.amountVnd,
        resolutionNote: `Không tìm thấy mã nạp SISNAP trong nội dung: ${params.transferContent}`,
      });
      await tx
        .update(paymentWebhooks)
        .set({ processingStatus: 'PROCESSED', processedAt: new Date() })
        .where(eq(paymentWebhooks.id, webhookRow.id));
      return { status: 'UNIDENTIFIED', message: 'Giao dịch thiếu mã nạp, đã đưa vào hàng đợi đối soát.' };
    }

    const topupCode = match[0];
    const [order] = await tx
      .select()
      .from(topupOrders)
      .where(eq(topupOrders.topupCode, topupCode))
      .for('update')
      .limit(1);

    if (!order) {
      await tx.insert(paymentReconciliations).values({
        webhookId: webhookRow.id,
        discrepancyType: 'UNIDENTIFIED',
        expectedAmountVnd: 0,
        actualAmountVnd: params.amountVnd,
        resolutionNote: `Mã nạp ${topupCode} không tồn tại trong hệ thống.`,
      });
      await tx
        .update(paymentWebhooks)
        .set({ processingStatus: 'PROCESSED', processedAt: new Date() })
        .where(eq(paymentWebhooks.id, webhookRow.id));
      return { status: 'UNIDENTIFIED', message: 'Không tìm thấy yêu cầu nạp tương ứng.' };
    }

    if (order.status === 'PAID') {
      await tx
        .update(paymentWebhooks)
        .set({ processingStatus: 'DUPLICATE', processedAt: new Date() })
        .where(eq(paymentWebhooks.id, webhookRow.id));
      return { status: 'ALREADY_PAID', message: 'Yêu cầu nạp đã được thanh toán trước đó.' };
    }

    const isLate = order.expiresAt < new Date() || order.status === 'EXPIRED';

    if (params.amountVnd < order.requestedAmountVnd) {
      await tx
        .update(topupOrders)
        .set({
          receivedAmountVnd: order.receivedAmountVnd + params.amountVnd,
          status: 'UNDERPAID',
        })
        .where(eq(topupOrders.id, order.id));

      await tx.insert(paymentReconciliations).values({
        topupOrderId: order.id,
        webhookId: webhookRow.id,
        discrepancyType: 'UNDERPAID',
        expectedAmountVnd: order.requestedAmountVnd,
        actualAmountVnd: params.amountVnd,
        resolutionNote: 'Khách chuyển thiếu số tiền so với yêu cầu. Chờ kế toán đối soát.',
      });

      await tx
        .update(paymentWebhooks)
        .set({ processingStatus: 'PROCESSED', processedAt: new Date() })
        .where(eq(paymentWebhooks.id, webhookRow.id));

      return { status: 'UNDERPAID', message: 'Số tiền nhận được thấp hơn yêu cầu, đã ghi nhận đối soát.' };
    }

    const discrepancyType =
      params.amountVnd > order.requestedAmountVnd
        ? 'OVERPAID'
        : isLate
        ? 'LATE'
        : 'MATCHED';

    await tx
      .update(topupOrders)
      .set({
        receivedAmountVnd: params.amountVnd,
        status: params.amountVnd > order.requestedAmountVnd ? 'OVERPAID' : 'PAID',
        paidAt: new Date(),
      })
      .where(eq(topupOrders.id, order.id));

    await tx.insert(paymentReconciliations).values({
      topupOrderId: order.id,
      webhookId: webhookRow.id,
      discrepancyType,
      expectedAmountVnd: order.requestedAmountVnd,
      actualAmountVnd: params.amountVnd,
      resolutionNote:
        discrepancyType === 'MATCHED'
          ? 'Khớp tự động qua webhook SHB VietQR.'
          : `Ghi nhận ${discrepancyType}, đã cộng đúng số tiền thực nhận.`,
    });

    await creditWalletAtomic(tx, {
      userId: order.userId,
      amountVnd: params.amountVnd,
      txType: 'TOPUP',
      source: params.providerCode,
      referenceCode: order.topupCode,
      description: `Nạp tiền VietQR SHB (${bank.accountNumber}) — Mã ${order.topupCode}`,
      idempotencyKey: `topup:${params.providerCode}:${params.externalTxId}`,
    });

    await tx
      .update(paymentWebhooks)
      .set({ processingStatus: 'PROCESSED', processedAt: new Date() })
      .where(eq(paymentWebhooks.id, webhookRow.id));

    return { status: 'PAID', topupCode: order.topupCode, creditedVnd: params.amountVnd };
  });
}

export async function adminConfirmTopupReconciliation(params: {
  adminUserId: number;
  topupCode: string;
  receivedAmountVnd: number;
  bankRefCode: string;
  note: string;
  ipAddress?: string | null;
}) {
  const bank = await getActiveReceivingBankConfig();

  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(topupOrders)
      .where(eq(topupOrders.topupCode, params.topupCode))
      .for('update')
      .limit(1);

    if (!order) {
      throw new Error('Không tìm thấy yêu cầu nạp tiền.');
    }

    if (order.status === 'PAID') {
      throw new Error('Yêu cầu nạp tiền này đã được cộng số dư trước đó.');
    }

    await tx
      .update(topupOrders)
      .set({
        receivedAmountVnd: params.receivedAmountVnd,
        status: 'PAID',
        paidAt: new Date(),
      })
      .where(eq(topupOrders.id, order.id));

    const creditRes = await creditWalletAtomic(tx, {
      userId: order.userId,
      amountVnd: params.receivedAmountVnd,
      txType: 'TOPUP',
      source: 'ADMIN_RECONCILE',
      referenceCode: order.topupCode,
      description: `Đối soát nạp SHB (${bank.accountNumber}) — Ref: ${params.bankRefCode}`,
      idempotencyKey: `admin-reconcile:${order.topupCode}`,
    });

    await tx.insert(paymentReconciliations).values({
      topupOrderId: order.id,
      discrepancyType:
        params.receivedAmountVnd === order.requestedAmountVnd ? 'MATCHED' : 'OVERPAID',
      expectedAmountVnd: order.requestedAmountVnd,
      actualAmountVnd: params.receivedAmountVnd,
      resolutionNote: `${params.note} (Bank Ref: ${params.bankRefCode})`,
      resolvedBy: params.adminUserId,
      resolvedAt: new Date(),
    });

    await tx.insert(adminLogs).values({
      adminUserId: params.adminUserId,
      action: 'TOPUP_MANUAL_RECONCILE',
      targetType: 'TOPUP_ORDER',
      targetId: order.topupCode,
      detailsJson: {
        receivedAmountVnd: params.receivedAmountVnd,
        bankRefCode: params.bankRefCode,
        note: params.note,
      },
      ipAddress: params.ipAddress || null,
    });

    await tx.insert(auditLogs).values({
      actorUserId: params.adminUserId,
      entityType: 'TOPUP_ORDER',
      entityId: String(order.id),
      action: 'TOPUP_CONFIRMED',
      afterJson: {
        topupCode: order.topupCode,
        receivedAmountVnd: params.receivedAmountVnd,
        bankRefCode: params.bankRefCode,
      },
      ipAddress: params.ipAddress || null,
    });

    return { order, txRecord: creditRes.txRecord };
  });
}
