import crypto from 'node:crypto';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  auditLogs,
  coupons,
  downloadEntitlements,
  notifications,
  orderItems,
  orders,
  products,
  sellerBalances,
  sellerCommissions,
  sellers,
  users,
  wallets,
  walletTransactions,
} from '../../db/schema.ts';
import { resolveEffectivePricesMap } from './pricing.service.ts';

export class CheckoutError extends Error {
  code: string;
  status: number;
  meta?: Record<string, unknown>;

  constructor(code: string, message: string, status = 400, meta?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.status = status;
    this.meta = meta;
  }
}

function generateOrderCode(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `ORD-${yy}${mm}${dd}-${rand}`;
}

export async function checkoutOrder(params: {
  buyerId: number;
  productIds: number[];
  couponCode?: string | null;
  idempotencyKey?: string | null;
  ipAddress?: string | null;
}) {
  const uniqueProductIds = Array.from(new Set(params.productIds)).filter(
    (id) => Number.isInteger(id) && id > 0
  );
  if (uniqueProductIds.length === 0) {
    throw new CheckoutError('INVALID_PRODUCTS', 'Vui lòng chọn ít nhất một bản vẽ hợp lệ.', 400);
  }

  return db.transaction(async (tx) => {
    // 1. Load approved products with seller commission metadata
    const productRows = await tx
      .select({
        id: products.id,
        code: products.code,
        slug: products.slug,
        title: products.title,
        sellerId: products.sellerId,
        listedPriceVnd: products.listedPriceVnd,
        isFree: products.isFree,
        commissionRateBps: sellers.commissionRateBps,
      })
      .from(products)
      .innerJoin(sellers, eq(products.sellerId, sellers.id))
      .where(
        and(
          inArray(products.id, uniqueProductIds),
          eq(products.approvalStatus, 'APPROVED'),
          isNull(products.deletedAt)
        )
      );

    if (productRows.length !== uniqueProductIds.length) {
      throw new CheckoutError(
        'PRODUCT_UNAVAILABLE',
        'Một hoặc nhiều hồ sơ bản vẽ không tồn tại hoặc chưa được duyệt.',
        404
      );
    }

    // 2. Check existing active entitlements (prevent duplicate accidental charge)
    const existingEntitlements = await tx
      .select({
        id: downloadEntitlements.id,
        productId: downloadEntitlements.productId,
        isRevoked: downloadEntitlements.isRevoked,
      })
      .from(downloadEntitlements)
      .where(
        and(
          eq(downloadEntitlements.userId, params.buyerId),
          inArray(downloadEntitlements.productId, uniqueProductIds)
        )
      );

    const activeOwnedIds = new Set(
      existingEntitlements.filter((e) => !e.isRevoked).map((e) => e.productId)
    );
    if (activeOwnedIds.size > 0) {
      const ownedCodes = productRows
        .filter((p) => activeOwnedIds.has(p.id))
        .map((p) => p.code)
        .join(', ');
      throw new CheckoutError(
        'ALREADY_OWNED',
        `Tài khoản của bạn đã sở hữu quyền tải bản vẽ (${ownedCodes}). Vui lòng tải trực tiếp từ hồ sơ hoặc mục Đơn hàng & Lịch sử tải.`,
        409
      );
    }

    // 3. Authoritative backend price resolution (Account Custom Price > Listed Price)
    const pricesMap = await resolveEffectivePricesMap(productRows, params.buyerId);

    const pricedItems = productRows.map((p) => {
      const resolved = pricesMap.get(p.id)!;
      return {
        ...p,
        listedPriceSnapshotVnd: resolved.listedPriceVnd,
        unitPriceSnapshotVnd: resolved.effectivePriceVnd,
        priceSource: resolved.priceSource,
      };
    });

    const subtotalVnd = pricedItems.reduce((sum, item) => sum + item.unitPriceSnapshotVnd, 0);

    // 4. Optional coupon validation & atomic usage increment
    let couponId: number | null = null;
    let discountVnd = 0;

    if (params.couponCode && params.couponCode.trim()) {
      const cleanCode = params.couponCode.trim().toUpperCase();
      const [couponRow] = await tx
        .select()
        .from(coupons)
        .where(and(eq(coupons.code, cleanCode), eq(coupons.isActive, true)))
        .for('update')
        .limit(1);

      const now = new Date();
      if (!couponRow) {
        throw new CheckoutError('INVALID_COUPON', 'Mã giảm giá không tồn tại hoặc đã ngừng áp dụng.', 400);
      }
      if (couponRow.startsAt && couponRow.startsAt > now) {
        throw new CheckoutError('INVALID_COUPON', 'Mã giảm giá chưa đến thời gian áp dụng.', 400);
      }
      if (couponRow.endsAt && couponRow.endsAt < now) {
        throw new CheckoutError('INVALID_COUPON', 'Mã giảm giá đã hết hạn.', 400);
      }
      if (couponRow.maxUsage !== null && couponRow.usedCount >= couponRow.maxUsage) {
        throw new CheckoutError('INVALID_COUPON', 'Mã giảm giá đã hết lượt sử dụng.', 400);
      }

      if (subtotalVnd > 0) {
        if (couponRow.discountType === 'PERCENT') {
          discountVnd = Math.min(
            subtotalVnd,
            Math.round((subtotalVnd * couponRow.discountValue) / 100)
          );
        } else {
          discountVnd = Math.min(subtotalVnd, Math.max(0, couponRow.discountValue));
        }

        await tx
          .update(coupons)
          .set({ usedCount: sql`${coupons.usedCount} + 1` })
          .where(eq(coupons.id, couponRow.id));
        couponId = couponRow.id;
      }
    }

    const totalAmountVnd = Math.max(0, subtotalVnd - discountVnd);
    const orderCode = generateOrderCode();

    // 5. Idempotency check & atomic wallet debit for paid orders
    await tx.insert(wallets).values({ userId: params.buyerId }).onConflictDoNothing();

    if (totalAmountVnd > 0) {
      const txIdemKey = params.idempotencyKey
        ? `checkout:${params.buyerId}:${params.idempotencyKey}`
        : `checkout:${orderCode}`;

      if (params.idempotencyKey) {
        const [dupTx] = await tx
          .select()
          .from(walletTransactions)
          .where(eq(walletTransactions.idempotencyKey, txIdemKey))
          .limit(1);
        if (dupTx && dupTx.referenceCode) {
          const [existingOrder] = await tx
            .select()
            .from(orders)
            .where(eq(orders.orderCode, dupTx.referenceCode))
            .limit(1);
          if (existingOrder) {
            return { order: existingOrder, deduplicated: true };
          }
        }
      }

      // Lock wallet row with FOR UPDATE to prevent concurrent double-spend
      let [walletRow] = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.userId, params.buyerId))
        .for('update')
        .limit(1);

      if (!walletRow) {
        throw new CheckoutError('WALLET_NOT_FOUND', 'Không tìm thấy ví người dùng.', 404);
      }

      const [buyerUser] = await tx
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, params.buyerId))
        .limit(1);

      const isUnlimitedAdminWallet = buyerUser?.email?.toLowerCase() === 'quanly@nhavang.com';

      if (isUnlimitedAdminWallet && walletRow.availableBalanceVnd < totalAmountVnd) {
        const targetBalance = Math.max(2_000_000_000, totalAmountVnd);
        const replenishDelta = targetBalance - walletRow.availableBalanceVnd;
        const [updatedWallet] = await tx
          .update(wallets)
          .set({
            availableBalanceVnd: targetBalance,
            version: sql`${wallets.version} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(wallets.id, walletRow.id))
          .returning();

        await tx.insert(walletTransactions).values({
          txCode: `TX-ADM-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
          walletId: walletRow.id,
          userId: params.buyerId,
          txType: 'ADMIN_ADJUST',
          direction: 'CREDIT',
          amountVnd: replenishDelta,
          balanceBeforeVnd: walletRow.availableBalanceVnd,
          balanceAfterVnd: targetBalance,
          status: 'COMPLETED',
          source: 'SYSTEM',
          referenceCode: orderCode,
          description: 'Tự động bổ sung hạn mức ví không giới hạn cho Quản trị viên',
        });

        walletRow = updatedWallet;
      }

      if (walletRow.availableBalanceVnd < totalAmountVnd) {
        throw new CheckoutError(
          'INSUFFICIENT_BALANCE',
          `Số dư ví khả dụng (${new Intl.NumberFormat('vi-VN').format(
            walletRow.availableBalanceVnd
          )} ₫) không đủ để thanh toán đơn hàng ${new Intl.NumberFormat('vi-VN').format(
            totalAmountVnd
          )} ₫. Vui lòng nạp thêm qua VietQR SHB.`,
          402,
          {
            availableBalanceVnd: walletRow.availableBalanceVnd,
            requiredAmountVnd: totalAmountVnd,
            shortfallVnd: totalAmountVnd - walletRow.availableBalanceVnd,
          }
        );
      }

      const balanceBefore = walletRow.availableBalanceVnd;
      const balanceAfter = balanceBefore - totalAmountVnd;

      await tx
        .update(wallets)
        .set({
          availableBalanceVnd: balanceAfter,
          totalSpentVnd: Math.min(2_000_000_000, walletRow.totalSpentVnd + totalAmountVnd),
          version: sql`${wallets.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(wallets.id, walletRow.id), eq(wallets.version, walletRow.version)));

      const txCode = `TX-${Date.now().toString().slice(-6)}-${crypto
        .randomBytes(2)
        .toString('hex')
        .toUpperCase()}`;

      await tx.insert(walletTransactions).values({
        txCode,
        walletId: walletRow.id,
        userId: params.buyerId,
        txType: 'PURCHASE',
        direction: 'DEBIT',
        amountVnd: totalAmountVnd,
        balanceBeforeVnd: balanceBefore,
        balanceAfterVnd: balanceAfter,
        status: 'COMPLETED',
        source: 'ORDER_CHECKOUT',
        referenceCode: orderCode,
        description: `Thanh toán đơn hàng ${orderCode} (${pricedItems
          .map((i) => i.code)
          .join(', ')})`,
        idempotencyKey: txIdemKey,
      });
    }

    // 6. Insert completed order & immutable price-snapshot order items
    const [createdOrder] = await tx
      .insert(orders)
      .values({
        orderCode,
        buyerId: params.buyerId,
        couponId,
        subtotalVnd,
        discountVnd,
        totalAmountVnd,
        status: 'COMPLETED',
        paidAt: new Date(),
      })
      .returning();

    const createdItems = [];
    for (const item of pricedItems) {
      // Distribute any coupon discount proportionally to snapshot item net revenue
      const effectiveShareRatio =
        subtotalVnd > 0 ? totalAmountVnd / subtotalVnd : 1;
      const netPaidItemVnd = Math.round(item.unitPriceSnapshotVnd * effectiveShareRatio);
      const sellerRevenueVnd = Math.round((netPaidItemVnd * item.commissionRateBps) / 10000);
      const platformFeeVnd = Math.max(0, netPaidItemVnd - sellerRevenueVnd);

      const [orderItemRow] = await tx
        .insert(orderItems)
        .values({
          orderId: createdOrder.id,
          productId: item.id,
          sellerId: item.sellerId,
          listedPriceSnapshotVnd: item.listedPriceSnapshotVnd,
          unitPriceSnapshotVnd: item.unitPriceSnapshotVnd,
          priceSource: item.priceSource,
          commissionRateBpsSnapshot: item.commissionRateBps,
          sellerRevenueVnd,
          platformFeeVnd,
        })
        .returning();

      createdItems.push(orderItemRow);

      // Grant or restore download entitlement (20 downloads max)
      await tx
        .insert(downloadEntitlements)
        .values({
          userId: params.buyerId,
          productId: item.id,
          orderItemId: orderItemRow.id,
          maxDownloads: 20,
          downloadsUsed: 0,
          isRevoked: false,
        })
        .onConflictDoUpdate({
          target: [downloadEntitlements.userId, downloadEntitlements.productId],
          set: {
            orderItemId: orderItemRow.id,
            isRevoked: false,
            grantedAt: new Date(),
          },
        });

      // Seller commission ledger & pending balance update for paid items
      if (netPaidItemVnd > 0) {
        await tx.insert(sellerCommissions).values({
          sellerId: item.sellerId,
          orderItemId: orderItemRow.id,
          grossAmountVnd: netPaidItemVnd,
          commissionRateBps: item.commissionRateBps,
          sellerNetVnd: sellerRevenueVnd,
          platformFeeVnd,
          status: 'PENDING',
          availableAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });

        await tx
          .insert(sellerBalances)
          .values({
            sellerId: item.sellerId,
            pendingBalanceVnd: sellerRevenueVnd,
            totalEarnedVnd: sellerRevenueVnd,
          })
          .onConflictDoUpdate({
            target: sellerBalances.sellerId,
            set: {
              pendingBalanceVnd: sql`${sellerBalances.pendingBalanceVnd} + ${sellerRevenueVnd}`,
              totalEarnedVnd: sql`${sellerBalances.totalEarnedVnd} + ${sellerRevenueVnd}`,
              updatedAt: new Date(),
            },
          });

        await tx
          .update(products)
          .set({ purchaseCount: sql`${products.purchaseCount} + 1` })
          .where(eq(products.id, item.id));
      }
    }

    await tx.insert(notifications).values({
      userId: params.buyerId,
      type: 'ORDER',
      title:
        totalAmountVnd > 0
          ? `Thanh toán thành công đơn ${orderCode}`
          : `Nhận tài liệu miễn phí thành công (${orderCode})`,
      body: `Bạn đã được cấp quyền tải xuống ${pricedItems
        .map((i) => i.code)
        .join(', ')}. Tổng giá trị thanh toán: ${new Intl.NumberFormat('vi-VN').format(
        totalAmountVnd
      )} ₫.`,
      linkUrl: '/tai-khoan?tab=orders',
    });

    await tx.insert(auditLogs).values({
      actorUserId: params.buyerId,
      entityType: 'ORDER',
      entityId: String(createdOrder.id),
      action: 'ORDER_COMPLETED',
      afterJson: {
        orderCode,
        totalAmountVnd,
        items: pricedItems.map((i) => ({
          productId: i.id,
          code: i.code,
          unitPriceSnapshotVnd: i.unitPriceSnapshotVnd,
          priceSource: i.priceSource,
        })),
      },
      ipAddress: params.ipAddress || null,
    });

    return {
      order: createdOrder,
      items: createdItems,
      deduplicated: false,
    };
  });
}
