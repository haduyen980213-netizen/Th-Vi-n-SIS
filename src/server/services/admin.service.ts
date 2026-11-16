import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  adminLogs,
  auditLogs,
  banners,
  categories,
  downloadEntitlements,
  notifications,
  orderItems,
  orders,
  products,
  roles,
  sellers,
  siteSettings,
  supportTickets,
  topupOrders,
  userProductPrices,
  userProfiles,
  userRoles,
  userSessions,
  users,
  wallets,
  walletTransactions,
} from '../../db/schema.ts';

export class AdminServiceError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function getAdminAnalyticsReport() {
  const [
    [{ totalUsers }],
    [{ totalSellers }],
    [{ approvedProducts }],
    [{ pendingProducts }],
    [{ openTickets }],
    [{ completedOrders, totalGmvVnd }],
    [{ platformFeeVnd, sellerNetTotalVnd }],
    [{ paidTopupCount, totalTopupPaidVnd }],
  ] = await Promise.all([
    db
      .select({ totalUsers: count() })
      .from(users)
      .where(isNull(users.deletedAt)),
    db.select({ totalSellers: count() }).from(sellers),
    db
      .select({ approvedProducts: count() })
      .from(products)
      .where(and(eq(products.approvalStatus, 'APPROVED'), isNull(products.deletedAt))),
    db
      .select({ pendingProducts: count() })
      .from(products)
      .where(and(eq(products.approvalStatus, 'PENDING'), isNull(products.deletedAt))),
    db
      .select({ openTickets: count() })
      .from(supportTickets)
      .where(or(eq(supportTickets.status, 'OPEN'), eq(supportTickets.status, 'IN_PROGRESS'))!),
    db
      .select({
        completedOrders: count(),
        totalGmvVnd: sql<number>`COALESCE(SUM(${orders.totalAmountVnd}), 0)`,
      })
      .from(orders)
      .where(eq(orders.status, 'COMPLETED')),
    db
      .select({
        platformFeeVnd: sql<number>`COALESCE(SUM(${orderItems.platformFeeVnd}), 0)`,
        sellerNetTotalVnd: sql<number>`COALESCE(SUM(${orderItems.sellerRevenueVnd}), 0)`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(eq(orders.status, 'COMPLETED')),
    db
      .select({
        paidTopupCount: count(),
        totalTopupPaidVnd: sql<number>`COALESCE(SUM(${topupOrders.requestedAmountVnd}), 0)`,
      })
      .from(topupOrders)
      .where(eq(topupOrders.status, 'PAID')),
  ]);

  const topProducts = await db
    .select({
      id: products.id,
      code: products.code,
      title: products.title,
      listedPriceVnd: products.listedPriceVnd,
      isFree: products.isFree,
      viewCount: products.viewCount,
      purchaseCount: products.purchaseCount,
      downloadCount: products.downloadCount,
      categoryName: categories.name,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.approvalStatus, 'APPROVED'), isNull(products.deletedAt)))
    .orderBy(desc(products.purchaseCount), desc(products.downloadCount), desc(products.viewCount))
    .limit(8);

  const dailySalesRows = await db.execute(sql`
    SELECT
      TO_CHAR(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS day,
      COUNT(*)::int AS order_count,
      COALESCE(SUM(total_amount_vnd), 0)::bigint AS revenue_vnd
    FROM orders
    WHERE status = 'COMPLETED' AND created_at >= NOW() - INTERVAL '14 days'
    GROUP BY day
    ORDER BY day DESC
  `);

  return {
    summary: {
      totalUsers: Number(totalUsers),
      totalSellers: Number(totalSellers),
      approvedProducts: Number(approvedProducts),
      pendingProducts: Number(pendingProducts),
      openTickets: Number(openTickets),
      completedOrders: Number(completedOrders),
      totalGmvVnd: Number(totalGmvVnd),
      platformFeeVnd: Number(platformFeeVnd),
      sellerNetTotalVnd: Number(sellerNetTotalVnd),
      paidTopupCount: Number(paidTopupCount),
      totalTopupPaidVnd: Number(totalTopupPaidVnd),
    },
    topProducts,
    dailySales: (dailySalesRows.rows || []).map((r: any) => ({
      day: String(r.day),
      orderCount: Number(r.order_count || 0),
      revenueVnd: Number(r.revenue_vnd || 0),
    })),
  };
}

export async function listAllRbacRoles() {
  return db.select().from(roles).orderBy(asc(roles.id));
}

export async function listAdminUsers(params: {
  q?: string;
  status?: string;
  role?: string;
  page?: number;
  limit?: number;
}) {
  const q = params.q?.trim();
  const roleFilter = params.role?.trim().toUpperCase();
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(params.limit) || 50));
  const offset = (page - 1) * limit;

  const conditions = [isNull(users.deletedAt)];

  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(
        ilike(users.fullName, pattern),
        ilike(users.email, pattern),
        ilike(users.phone, pattern)
      )!
    );
  }
  if (params.status && params.status !== 'ALL') {
    conditions.push(eq(users.status, params.status));
  }
  if (roleFilter && roleFilter !== 'ALL') {
    const roleMatches = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(roles.code, roleFilter));
    const matchedIds = roleMatches.map((r) => r.userId);
    if (matchedIds.length === 0) {
      const [
        [{ totalAll }],
        [{ activeAll }],
        [{ lockedAll }],
        [{ sellersAll }],
      ] = await Promise.all([
        db.select({ totalAll: count() }).from(users).where(isNull(users.deletedAt)),
        db.select({ activeAll: count() }).from(users).where(and(isNull(users.deletedAt), eq(users.status, 'ACTIVE'))),
        db.select({ lockedAll: count() }).from(users).where(and(isNull(users.deletedAt), eq(users.status, 'LOCKED'))),
        db.select({ sellersAll: count() }).from(sellers),
      ]);
      return {
        items: [],
        summary: {
          total: Number(totalAll),
          active: Number(activeAll),
          locked: Number(lockedAll),
          sellers: Number(sellersAll),
        },
        pagination: { page, limit, total: 0, totalPages: 1 },
      };
    }
    conditions.push(inArray(users.id, matchedIds));
  }

  const [
    [{ totalFiltered }],
    [{ totalAll }],
    [{ activeAll }],
    [{ lockedAll }],
    [{ sellersAll }],
    userRows,
  ] = await Promise.all([
    db.select({ totalFiltered: count() }).from(users).where(and(...conditions)),
    db.select({ totalAll: count() }).from(users).where(isNull(users.deletedAt)),
    db.select({ activeAll: count() }).from(users).where(and(isNull(users.deletedAt), eq(users.status, 'ACTIVE'))),
    db.select({ lockedAll: count() }).from(users).where(and(isNull(users.deletedAt), eq(users.status, 'LOCKED'))),
    db.select({ sellersAll: count() }).from(sellers),
    db
      .select({
        id: users.id,
        email: users.email,
        phone: users.phone,
        fullName: users.fullName,
        status: users.status,
        emailVerified: users.emailVerified,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        walletBalanceVnd: wallets.availableBalanceVnd,
        sellerDisplayName: sellers.displayName,
      })
      .from(users)
      .leftJoin(wallets, eq(users.id, wallets.userId))
      .leftJoin(sellers, eq(users.id, sellers.userId))
      .where(and(...conditions))
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(limit)
      .offset(offset),
  ]);

  const userIds = userRows.map((u) => u.id);
  const roleRows =
    userIds.length > 0
      ? await db
          .select({
            userId: userRoles.userId,
            roleCode: roles.code,
          })
          .from(userRoles)
          .innerJoin(roles, eq(userRoles.roleId, roles.id))
          .where(inArray(userRoles.userId, userIds))
      : [];

  return {
    items: userRows.map((u) => ({
      ...u,
      walletBalanceVnd: u.walletBalanceVnd ?? 0,
      roles: roleRows.filter((r) => r.userId === u.id).map((r) => r.roleCode),
    })),
    summary: {
      total: Number(totalAll),
      active: Number(activeAll),
      locked: Number(lockedAll),
      sellers: Number(sellersAll),
    },
    pagination: {
      page,
      limit,
      total: Number(totalFiltered),
      totalPages: Math.max(1, Math.ceil(Number(totalFiltered) / limit)),
    },
  };
}

export async function createAdminUser(params: {
  actorUserId: number;
  actorRoles: string[];
  fullName: string;
  email: string;
  phone?: string | null;
  password: string;
  roleCodes?: string[];
  initialWalletVnd?: number;
  emailVerified?: boolean;
  ipAddress?: string | null;
}) {
  const actorIsSuperAdmin = params.actorRoles.includes('SUPER_ADMIN');
  const emailNormalized = params.email.trim().toLowerCase();
  const phoneNormalized = params.phone?.trim() || null;
  const initialBalance = Math.max(0, Math.round(Number(params.initialWalletVnd) || 0));

  const requestedRoles = Array.from(
    new Set((params.roleCodes && params.roleCodes.length > 0 ? params.roleCodes : ['MEMBER']).map((r) => r.toUpperCase()))
  );
  if (!requestedRoles.includes('MEMBER')) {
    requestedRoles.push('MEMBER');
  }
  if (requestedRoles.includes('SUPER_ADMIN') && !actorIsSuperAdmin) {
    throw new AdminServiceError(
      'FORBIDDEN_SUPER_ADMIN',
      'Chỉ SUPER_ADMIN mới có quyền tạo tài khoản có vai trò SUPER_ADMIN.',
      403
    );
  }

  const passwordHash = await bcrypt.hash(params.password, 12);

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: users.id, email: users.email, phone: users.phone })
      .from(users)
      .where(
        phoneNormalized
          ? or(eq(users.email, emailNormalized), eq(users.phone, phoneNormalized))!
          : eq(users.email, emailNormalized)
      )
      .limit(1);

    if (existing.length > 0) {
      throw new AdminServiceError(
        'ACCOUNT_EXISTS',
        existing[0].email === emailNormalized
          ? 'Email này đã được sử dụng.'
          : 'Số điện thoại này đã được đăng ký.',
        409
      );
    }

    const uid = `local_${crypto.randomBytes(12).toString('hex')}`;
    const [created] = await tx
      .insert(users)
      .values({
        uid,
        email: emailNormalized,
        phone: phoneNormalized,
        passwordHash,
        fullName: params.fullName.trim(),
        emailVerified: params.emailVerified ?? true,
        status: 'ACTIVE',
      })
      .returning();

    await tx.insert(userProfiles).values({ userId: created.id });

    const [wallet] = await tx
      .insert(wallets)
      .values({
        userId: created.id,
        availableBalanceVnd: initialBalance,
        pendingBalanceVnd: 0,
        totalDepositedVnd: initialBalance,
        totalSpentVnd: 0,
        currency: 'VND',
      })
      .returning();

    if (initialBalance > 0) {
      const txCode = `TX-ADM-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      await tx.insert(walletTransactions).values({
        txCode,
        walletId: wallet.id,
        userId: created.id,
        txType: 'ADMIN_ADJUST',
        direction: 'CREDIT',
        amountVnd: initialBalance,
        balanceBeforeVnd: 0,
        balanceAfterVnd: initialBalance,
        status: 'COMPLETED',
        source: 'ADMIN_PANEL',
        referenceCode: `INIT-${created.id}`,
        description: 'Cấp số dư khởi tạo khi quản trị viên tạo tài khoản',
      });
    }

    const allRoles = await tx.select().from(roles);
    const roleMap = new Map(allRoles.map((r) => [r.code, r.id]));
    for (const code of requestedRoles) {
      const roleId = roleMap.get(code);
      if (!roleId) {
        throw new AdminServiceError('INVALID_ROLE', `Vai trò ${code} không tồn tại.`, 400);
      }
      await tx.insert(userRoles).values({
        userId: created.id,
        roleId,
        assignedBy: params.actorUserId,
      });
    }

    await tx.insert(adminLogs).values({
      adminUserId: params.actorUserId,
      action: 'ADMIN_USER_CREATED',
      targetType: 'USER',
      targetId: String(created.id),
      detailsJson: {
        email: created.email,
        roles: requestedRoles,
        initialWalletVnd: initialBalance,
      },
      ipAddress: params.ipAddress || null,
    });

    await tx.insert(notifications).values({
      userId: created.id,
      type: 'SYSTEM',
      title: 'Chào mừng đến với THƯ VIỆN SIS',
      body: 'Tài khoản của bạn đã được quản trị viên khởi tạo và kích hoạt.',
      linkUrl: '/tai-khoan',
    });

    return {
      id: created.id,
      email: created.email,
      fullName: created.fullName,
      roles: requestedRoles,
      walletBalanceVnd: initialBalance,
    };
  });
}

export async function getAdminUserDetail(targetUserId: number) {
  const [userRow] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, targetUserId), isNull(users.deletedAt)))
    .limit(1);

  if (!userRow) {
    throw new AdminServiceError('USER_NOT_FOUND', 'Không tìm thấy tài khoản thành viên.', 404);
  }

  const [
    profileRows,
    roleRows,
    sellerRows,
    walletRows,
    txRows,
    orderRows,
    entitlementRows,
    customPriceRows,
    ticketRows,
    [{ activeSessionsCount }],
  ] = await Promise.all([
    db.select().from(userProfiles).where(eq(userProfiles.userId, targetUserId)).limit(1),
    db
      .select({ code: roles.code })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, targetUserId)),
    db.select().from(sellers).where(eq(sellers.userId, targetUserId)).limit(1),
    db.select().from(wallets).where(eq(wallets.userId, targetUserId)).limit(1),
    db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.userId, targetUserId))
      .orderBy(desc(walletTransactions.createdAt))
      .limit(12),
    db
      .select({
        id: orders.id,
        orderCode: orders.orderCode,
        totalAmountVnd: orders.totalAmountVnd,
        status: orders.status,
        paidAt: orders.paidAt,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(eq(orders.buyerId, targetUserId))
      .orderBy(desc(orders.createdAt))
      .limit(10),
    db
      .select({
        id: downloadEntitlements.id,
        productId: downloadEntitlements.productId,
        productCode: products.code,
        productSlug: products.slug,
        productTitle: products.title,
        downloadsUsed: downloadEntitlements.downloadsUsed,
        maxDownloads: downloadEntitlements.maxDownloads,
        isRevoked: downloadEntitlements.isRevoked,
        grantedAt: downloadEntitlements.grantedAt,
      })
      .from(downloadEntitlements)
      .innerJoin(products, eq(downloadEntitlements.productId, products.id))
      .where(eq(downloadEntitlements.userId, targetUserId))
      .orderBy(desc(downloadEntitlements.grantedAt))
      .limit(30),
    db
      .select({
        id: userProductPrices.id,
        productId: userProductPrices.productId,
        productCode: products.code,
        productTitle: products.title,
        listedPriceVnd: products.listedPriceVnd,
        customPriceVnd: userProductPrices.customPriceVnd,
        isActive: userProductPrices.isActive,
      })
      .from(userProductPrices)
      .innerJoin(products, eq(userProductPrices.productId, products.id))
      .where(eq(userProductPrices.userId, targetUserId))
      .orderBy(desc(userProductPrices.updatedAt))
      .limit(20),
    db
      .select()
      .from(supportTickets)
      .where(
        or(
          eq(supportTickets.userId, targetUserId),
          eq(supportTickets.contactEmail, userRow.email)
        )!
      )
      .orderBy(desc(supportTickets.createdAt))
      .limit(20),
    db
      .select({ activeSessionsCount: count() })
      .from(userSessions)
      .where(
        and(
          eq(userSessions.userId, targetUserId),
          isNull(userSessions.revokedAt),
          sql`${userSessions.expiresAt} > NOW()`
        )
      ),
  ]);

  const wallet = walletRows[0] || {
    availableBalanceVnd: 0,
    pendingBalanceVnd: 0,
    totalDepositedVnd: 0,
    totalSpentVnd: 0,
    currency: 'VND',
  };

  return {
    user: {
      id: userRow.id,
      email: userRow.email,
      phone: userRow.phone,
      fullName: userRow.fullName,
      status: userRow.status as 'ACTIVE' | 'LOCKED' | 'PENDING',
      emailVerified: userRow.emailVerified,
      lastLoginAt: userRow.lastLoginAt,
      createdAt: userRow.createdAt,
      walletBalanceVnd: wallet.availableBalanceVnd,
      sellerDisplayName: sellerRows[0]?.displayName || null,
      roles: roleRows.map((r) => r.code),
    },
    profile: profileRows[0] || null,
    seller: sellerRows[0] || null,
    activeSessionsCount: Number(activeSessionsCount || 0),
    wallet: {
      availableBalanceVnd: wallet.availableBalanceVnd,
      pendingBalanceVnd: wallet.pendingBalanceVnd,
      totalDepositedVnd: wallet.totalDepositedVnd,
      totalSpentVnd: wallet.totalSpentVnd,
      currency: wallet.currency,
    },
    recentWalletTransactions: txRows,
    recentOrders: orderRows,
    entitlements: entitlementRows,
    customPrices: customPriceRows,
    supportTickets: ticketRows,
  };
}

export async function updateAdminUserProfileAndSecurity(params: {
  actorUserId: number;
  actorRoles: string[];
  targetUserId: number;
  fullName?: string;
  phone?: string | null;
  emailVerified?: boolean;
  companyName?: string | null;
  jobTitle?: string | null;
  address?: string | null;
  city?: string | null;
  newPassword?: string;
  revokeSessions?: boolean;
  reason?: string | null;
  ipAddress?: string | null;
}) {
  const actorIsSuperAdmin = params.actorRoles.includes('SUPER_ADMIN');

  return db.transaction(async (tx) => {
    const [targetUser] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, params.targetUserId), isNull(users.deletedAt)))
      .limit(1);

    if (!targetUser) {
      throw new AdminServiceError('USER_NOT_FOUND', 'Không tìm thấy tài khoản thành viên.', 404);
    }

    const targetRoles = await tx
      .select({ roleCode: roles.code })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, targetUser.id));

    if (
      targetRoles.some((r) => r.roleCode === 'SUPER_ADMIN') &&
      !actorIsSuperAdmin &&
      targetUser.id !== params.actorUserId
    ) {
      throw new AdminServiceError(
        'FORBIDDEN_SUPER_ADMIN',
        'Chỉ SUPER_ADMIN mới có quyền hỗ trợ chỉnh sửa tài khoản SUPER_ADMIN khác.',
        403
      );
    }

    if (params.phone) {
      const [phoneConflict] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.phone, params.phone), ne(users.id, targetUser.id)))
        .limit(1);
      if (phoneConflict) {
        throw new AdminServiceError(
          'PHONE_EXISTS',
          'Số điện thoại này đang thuộc về một tài khoản khác.',
          409
        );
      }
    }

    const userUpdates: Record<string, any> = { updatedAt: new Date() };
    if (params.fullName !== undefined) userUpdates.fullName = params.fullName;
    if (params.phone !== undefined) userUpdates.phone = params.phone;
    if (params.emailVerified !== undefined) userUpdates.emailVerified = params.emailVerified;
    if (params.newPassword) {
      userUpdates.passwordHash = await bcrypt.hash(params.newPassword, 12);
    }

    await tx.update(users).set(userUpdates).where(eq(users.id, targetUser.id));

    await tx
      .insert(userProfiles)
      .values({
        userId: targetUser.id,
        companyName: params.companyName ?? null,
        jobTitle: params.jobTitle ?? null,
        address: params.address ?? null,
        city: params.city ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: {
          ...(params.companyName !== undefined ? { companyName: params.companyName } : {}),
          ...(params.jobTitle !== undefined ? { jobTitle: params.jobTitle } : {}),
          ...(params.address !== undefined ? { address: params.address } : {}),
          ...(params.city !== undefined ? { city: params.city } : {}),
          updatedAt: new Date(),
        },
      });

    if (params.revokeSessions || params.newPassword) {
      await tx
        .update(userSessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(userSessions.userId, targetUser.id), isNull(userSessions.revokedAt)));
    }

    await tx.insert(adminLogs).values({
      adminUserId: params.actorUserId,
      action: params.newPassword ? 'ADMIN_USER_PASSWORD_RESET' : 'ADMIN_USER_PROFILE_ASSISTED',
      targetType: 'USER',
      targetId: String(targetUser.id),
      detailsJson: {
        email: targetUser.email,
        passwordReset: Boolean(params.newPassword),
        sessionsRevoked: Boolean(params.revokeSessions || params.newPassword),
        emailVerified: params.emailVerified,
        reason: params.reason || null,
      },
      ipAddress: params.ipAddress || null,
    });

    await tx.insert(notifications).values({
      userId: targetUser.id,
      type: 'SYSTEM',
      title: params.newPassword
        ? 'Quản trị viên đã hỗ trợ đặt lại mật khẩu'
        : 'Thông tin tài khoản được hỗ trợ cập nhật',
      body: params.newPassword
        ? 'Mật khẩu tài khoản của bạn đã được quản trị viên hỗ trợ cấp lại. Vui lòng đăng nhập và đổi mật khẩu mới nếu cần.'
        : 'Quản trị viên đã hỗ trợ cập nhật thông tin hồ sơ tài khoản của bạn.',
      linkUrl: '/tai-khoan',
    });

    return { updatedUserId: targetUser.id };
  });
}

export async function adjustUserWalletByAdmin(params: {
  actorUserId: number;
  targetUserId: number;
  direction: 'CREDIT' | 'DEBIT';
  amountVnd: number;
  reason: string;
  ipAddress?: string | null;
}) {
  const amount = Math.round(Number(params.amountVnd));
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new AdminServiceError('INVALID_AMOUNT', 'Số tiền điều chỉnh phải lớn hơn 0 VND.', 400);
  }

  return db.transaction(async (tx) => {
    const [targetUser] = await tx
      .select({ id: users.id, email: users.email, fullName: users.fullName })
      .from(users)
      .where(and(eq(users.id, params.targetUserId), isNull(users.deletedAt)))
      .limit(1);

    if (!targetUser) {
      throw new AdminServiceError('USER_NOT_FOUND', 'Không tìm thấy tài khoản thành viên.', 404);
    }

    const lockedResult = await tx.execute(
      sql`SELECT id, available_balance_vnd, total_deposited_vnd, total_spent_vnd, version FROM wallets WHERE user_id = ${targetUser.id} FOR UPDATE`
    );

    let walletRow = lockedResult.rows[0] as any;
    if (!walletRow) {
      const [createdWallet] = await tx
        .insert(wallets)
        .values({
          userId: targetUser.id,
          availableBalanceVnd: 0,
          pendingBalanceVnd: 0,
          totalDepositedVnd: 0,
          totalSpentVnd: 0,
          currency: 'VND',
        })
        .returning();
      walletRow = {
        id: createdWallet.id,
        available_balance_vnd: 0,
        total_deposited_vnd: 0,
        total_spent_vnd: 0,
        version: 1,
      };
    }

    const beforeBalance = Number(walletRow.available_balance_vnd);
    const afterBalance =
      params.direction === 'CREDIT' ? beforeBalance + amount : beforeBalance - amount;

    if (afterBalance < 0) {
      throw new AdminServiceError(
        'INSUFFICIENT_WALLET_BALANCE',
        `Số dư hiện tại (${beforeBalance.toLocaleString('vi-VN')} ₫) không đủ để khấu trừ ${amount.toLocaleString('vi-VN')} ₫.`,
        400
      );
    }

    await tx
      .update(wallets)
      .set({
        availableBalanceVnd: afterBalance,
        ...(params.direction === 'CREDIT'
          ? { totalDepositedVnd: Number(walletRow.total_deposited_vnd) + amount }
          : {}),
        version: Number(walletRow.version) + 1,
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, Number(walletRow.id)));

    const txCode = `TX-ADM-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    await tx.insert(walletTransactions).values({
      txCode,
      walletId: Number(walletRow.id),
      userId: targetUser.id,
      txType: 'ADMIN_ADJUST',
      direction: params.direction,
      amountVnd: amount,
      balanceBeforeVnd: beforeBalance,
      balanceAfterVnd: afterBalance,
      status: 'COMPLETED',
      source: 'ADMIN_PANEL',
      referenceCode: `ADM-${params.actorUserId}`,
      description:
        params.direction === 'CREDIT'
          ? `Quản trị viên hỗ trợ cộng ví: ${params.reason}`
          : `Quản trị viên điều chỉnh trừ ví: ${params.reason}`,
    });

    await tx.insert(adminLogs).values({
      adminUserId: params.actorUserId,
      action: 'ADMIN_WALLET_ADJUSTED',
      targetType: 'WALLET',
      targetId: String(targetUser.id),
      detailsJson: {
        email: targetUser.email,
        direction: params.direction,
        amountVnd: amount,
        beforeBalance,
        afterBalance,
        reason: params.reason,
        txCode,
      },
      ipAddress: params.ipAddress || null,
    });

    await tx.insert(auditLogs).values({
      actorUserId: params.actorUserId,
      entityType: 'WALLET',
      entityId: String(walletRow.id),
      action: 'ADMIN_ADJUST',
      beforeJson: { availableBalanceVnd: beforeBalance },
      afterJson: { availableBalanceVnd: afterBalance, reason: params.reason },
      ipAddress: params.ipAddress || null,
    });

    await tx.insert(notifications).values({
      userId: targetUser.id,
      type: 'WALLET',
      title:
        params.direction === 'CREDIT'
          ? `Ví được hỗ trợ cộng +${amount.toLocaleString('vi-VN')} ₫`
          : `Ví được điều chỉnh -${amount.toLocaleString('vi-VN')} ₫`,
      body: `Lý do: ${params.reason}. Số dư hiện tại: ${afterBalance.toLocaleString('vi-VN')} ₫.`,
      linkUrl: '/tai-khoan?tab=wallet',
    });

    return {
      txCode,
      balanceBeforeVnd: beforeBalance,
      balanceAfterVnd: afterBalance,
    };
  });
}

export async function grantUserDrawingEntitlementByAdmin(params: {
  actorUserId: number;
  targetUserId: number;
  productId: number;
  additionalDownloads?: number;
  reason?: string | null;
  ipAddress?: string | null;
}) {
  const extraDownloads = Math.min(100, Math.max(1, Math.round(Number(params.additionalDownloads) || 20)));

  return db.transaction(async (tx) => {
    const [targetUser] = await tx
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(and(eq(users.id, params.targetUserId), isNull(users.deletedAt)))
      .limit(1);

    if (!targetUser) {
      throw new AdminServiceError('USER_NOT_FOUND', 'Không tìm thấy tài khoản thành viên.', 404);
    }

    const [product] = await tx
      .select({
        id: products.id,
        code: products.code,
        slug: products.slug,
        title: products.title,
      })
      .from(products)
      .where(and(eq(products.id, params.productId), isNull(products.deletedAt)))
      .limit(1);

    if (!product) {
      throw new AdminServiceError('PRODUCT_NOT_FOUND', 'Không tìm thấy hồ sơ bản vẽ.', 404);
    }

    const [existing] = await tx
      .select()
      .from(downloadEntitlements)
      .where(
        and(
          eq(downloadEntitlements.userId, targetUser.id),
          eq(downloadEntitlements.productId, product.id)
        )
      )
      .limit(1);

    let resultEntitlement;
    if (existing) {
      const [updated] = await tx
        .update(downloadEntitlements)
        .set({
          maxDownloads: existing.maxDownloads + extraDownloads,
          isRevoked: false,
        })
        .where(eq(downloadEntitlements.id, existing.id))
        .returning();
      resultEntitlement = updated;
    } else {
      const [created] = await tx
        .insert(downloadEntitlements)
        .values({
          userId: targetUser.id,
          productId: product.id,
          maxDownloads: extraDownloads,
          downloadsUsed: 0,
          isRevoked: false,
        })
        .returning();
      resultEntitlement = created;
    }

    await tx.insert(adminLogs).values({
      adminUserId: params.actorUserId,
      action: 'ADMIN_ENTITLEMENT_GRANTED',
      targetType: 'ENTITLEMENT',
      targetId: `${targetUser.id}:${product.id}`,
      detailsJson: {
        email: targetUser.email,
        productCode: product.code,
        additionalDownloads: extraDownloads,
        newMaxDownloads: resultEntitlement.maxDownloads,
        reason: params.reason || null,
      },
      ipAddress: params.ipAddress || null,
    });

    await tx.insert(notifications).values({
      userId: targetUser.id,
      type: 'ORDER',
      title: `Được hỗ trợ quyền tải hồ sơ ${product.code}`,
      body: `Quản trị viên đã mở quyền tải xuống bản vẽ "${product.title}" (+${extraDownloads} lượt tải).${
        params.reason ? ` Ghi chú: ${params.reason}` : ''
      }`,
      linkUrl: `/ban-ve/${product.slug}`,
    });

    return resultEntitlement;
  });
}

export async function sendAdminDirectSupportToUser(params: {
  actorUserId: number;
  targetUserId: number;
  title: string;
  message: string;
  createTicketLog?: boolean;
  ipAddress?: string | null;
}) {
  return db.transaction(async (tx) => {
    const [targetUser] = await tx
      .select({ id: users.id, email: users.email, fullName: users.fullName })
      .from(users)
      .where(and(eq(users.id, params.targetUserId), isNull(users.deletedAt)))
      .limit(1);

    if (!targetUser) {
      throw new AdminServiceError('USER_NOT_FOUND', 'Không tìm thấy tài khoản thành viên.', 404);
    }

    const [notif] = await tx
      .insert(notifications)
      .values({
        userId: targetUser.id,
        type: 'SUPPORT',
        title: params.title.trim(),
        body: params.message.trim(),
        linkUrl: '/tai-khoan?tab=notifications',
      })
      .returning();

    let ticketCode: string | null = null;
    if (params.createTicketLog) {
      ticketCode = `SUP-ADM-${Date.now().toString().slice(-6)}`;
      await tx.insert(supportTickets).values({
        ticketCode,
        userId: targetUser.id,
        contactName: targetUser.fullName,
        contactEmail: targetUser.email,
        subject: params.title.trim(),
        category: 'ACCOUNT',
        message: `[Hỗ trợ trực tiếp từ Quản trị viên] ${params.message.trim()}`,
        status: 'RESOLVED',
        assignedTo: params.actorUserId,
      });
    }

    await tx.insert(adminLogs).values({
      adminUserId: params.actorUserId,
      action: 'ADMIN_DIRECT_SUPPORT_SENT',
      targetType: 'USER',
      targetId: String(targetUser.id),
      detailsJson: {
        email: targetUser.email,
        title: params.title.trim(),
        ticketCode,
      },
      ipAddress: params.ipAddress || null,
    });

    return { notificationId: notif.id, ticketCode };
  });
}

export async function updateAdminUserRolesAndStatus(params: {
  actorUserId: number;
  actorRoles: string[];
  targetUserId: number;
  roleCodes?: string[];
  status?: 'ACTIVE' | 'LOCKED';
  reason?: string | null;
  ipAddress?: string | null;
}) {
  const actorIsSuperAdmin = params.actorRoles.includes('SUPER_ADMIN');

  return db.transaction(async (tx) => {
    const [targetUser] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, params.targetUserId), isNull(users.deletedAt)))
      .limit(1);

    if (!targetUser) {
      throw new AdminServiceError('USER_NOT_FOUND', 'Không tìm thấy tài khoản thành viên.', 404);
    }

    const currentRoleRows = await tx
      .select({ roleId: roles.id, roleCode: roles.code })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, targetUser.id));
    const currentCodes = currentRoleRows.map((r) => r.roleCode);

    if (targetUser.id === params.actorUserId && params.status === 'LOCKED') {
      throw new AdminServiceError(
        'CANNOT_LOCK_SELF',
        'Không thể tự khóa tài khoản quản trị đang đăng nhập.',
        400
      );
    }

    if (currentCodes.includes('SUPER_ADMIN') && !actorIsSuperAdmin) {
      throw new AdminServiceError(
        'FORBIDDEN_SUPER_ADMIN',
        'Chỉ SUPER_ADMIN mới có quyền chỉnh sửa tài khoản SUPER_ADMIN.',
        403
      );
    }

    let nextRoles = currentCodes;
    if (params.roleCodes) {
      const normalized = Array.from(new Set(params.roleCodes.map((r) => r.toUpperCase())));
      if (!normalized.includes('MEMBER')) {
        normalized.push('MEMBER');
      }

      if (normalized.includes('SUPER_ADMIN') && !actorIsSuperAdmin) {
        throw new AdminServiceError(
          'FORBIDDEN_SUPER_ADMIN',
          'Chỉ SUPER_ADMIN mới có quyền cấp vai trò SUPER_ADMIN.',
          403
        );
      }

      // Guard: prevent removing SUPER_ADMIN from the last SUPER_ADMIN
      if (currentCodes.includes('SUPER_ADMIN') && !normalized.includes('SUPER_ADMIN')) {
        const [{ otherSuperAdmins }] = await tx
          .select({ otherSuperAdmins: count() })
          .from(userRoles)
          .innerJoin(roles, eq(userRoles.roleId, roles.id))
          .where(and(eq(roles.code, 'SUPER_ADMIN'), ne(userRoles.userId, targetUser.id)));

        if (Number(otherSuperAdmins) === 0) {
          throw new AdminServiceError(
            'LAST_SUPER_ADMIN',
            'Hệ thống phải có ít nhất một tài khoản SUPER_ADMIN.',
            400
          );
        }
      }

      const allRoles = await tx.select().from(roles);
      const roleMap = new Map(allRoles.map((r) => [r.code, r.id]));

      await tx.delete(userRoles).where(eq(userRoles.userId, targetUser.id));

      const toInsert: Array<{ userId: number; roleId: number; assignedBy: number }> = [];
      for (const code of normalized) {
        const roleId = roleMap.get(code);
        if (!roleId) {
          throw new AdminServiceError('INVALID_ROLE', `Vai trò ${code} không tồn tại.`, 400);
        }
        toInsert.push({ userId: targetUser.id, roleId, assignedBy: params.actorUserId });
      }
      if (toInsert.length > 0) {
        await tx.insert(userRoles).values(toInsert);
      }
      nextRoles = normalized;
    }

    let nextStatus = targetUser.status;
    if (params.status && params.status !== targetUser.status) {
      await tx
        .update(users)
        .set({ status: params.status, updatedAt: new Date() })
        .where(eq(users.id, targetUser.id));
      nextStatus = params.status;

      if (params.status === 'LOCKED') {
        await tx
          .update(userSessions)
          .set({ revokedAt: new Date() })
          .where(and(eq(userSessions.userId, targetUser.id), isNull(userSessions.revokedAt)));
      }
    }

    await tx.insert(adminLogs).values({
      adminUserId: params.actorUserId,
      action: 'USER_RBAC_STATUS_UPDATED',
      targetType: 'USER',
      targetId: String(targetUser.id),
      detailsJson: {
        email: targetUser.email,
        previousRoles: currentCodes,
        nextRoles,
        previousStatus: targetUser.status,
        nextStatus,
        reason: params.reason || null,
      },
      ipAddress: params.ipAddress || null,
    });

    await tx.insert(notifications).values({
      userId: targetUser.id,
      type: 'SYSTEM',
      title: 'Cập nhật quyền truy cập tài khoản',
      body: `Quản trị viên đã cập nhật vai trò (${nextRoles.join(', ')}) và trạng thái tài khoản (${nextStatus}).`,
      linkUrl: '/tai-khoan',
    });

    return {
      id: targetUser.id,
      email: targetUser.email,
      status: nextStatus,
      roles: nextRoles,
    };
  });
}

// ============================================================================
// CMS: BANNERS, CATEGORIES & SITE SETTINGS
// ============================================================================

export async function getPublicCmsHomeData() {
  const [activeBanners, settingsRows] = await Promise.all([
    db
      .select()
      .from(banners)
      .where(eq(banners.isActive, true))
      .orderBy(asc(banners.sortOrder), desc(banners.id))
      .limit(5),
    db.select().from(siteSettings),
  ]);

  const settingsMap: Record<string, string> = {};
  for (const s of settingsRows) {
    settingsMap[s.key] = s.value;
  }

  return {
    banners: activeBanners,
    settings: settingsMap,
  };
}

export async function listAdminBanners() {
  return db.select().from(banners).orderBy(asc(banners.sortOrder), desc(banners.id));
}

export async function upsertAdminBanner(params: {
  adminUserId: number;
  id?: number;
  title: string;
  subtitle?: string | null;
  imageUrl: string;
  targetUrl?: string | null;
  position?: string;
  sortOrder?: number;
  isActive?: boolean;
  ipAddress?: string | null;
}) {
  if (params.id) {
    const [updated] = await db
      .update(banners)
      .set({
        title: params.title,
        subtitle: params.subtitle ?? null,
        imageUrl: params.imageUrl,
        targetUrl: params.targetUrl ?? null,
        position: params.position || 'HOME_HERO',
        sortOrder: params.sortOrder ?? 0,
        isActive: params.isActive ?? true,
      })
      .where(eq(banners.id, params.id))
      .returning();

    if (!updated) {
      throw new AdminServiceError('BANNER_NOT_FOUND', 'Không tìm thấy banner.', 404);
    }

    await db.insert(adminLogs).values({
      adminUserId: params.adminUserId,
      action: 'CMS_BANNER_UPDATED',
      targetType: 'BANNER',
      targetId: String(updated.id),
      detailsJson: { title: updated.title, isActive: updated.isActive },
      ipAddress: params.ipAddress || null,
    });

    return updated;
  }

  const [created] = await db
    .insert(banners)
    .values({
      title: params.title,
      subtitle: params.subtitle ?? null,
      imageUrl: params.imageUrl,
      targetUrl: params.targetUrl ?? null,
      position: params.position || 'HOME_HERO',
      sortOrder: params.sortOrder ?? 0,
      isActive: params.isActive ?? true,
    })
    .returning();

  await db.insert(adminLogs).values({
    adminUserId: params.adminUserId,
    action: 'CMS_BANNER_CREATED',
    targetType: 'BANNER',
    targetId: String(created.id),
    detailsJson: { title: created.title, isActive: created.isActive },
    ipAddress: params.ipAddress || null,
  });

  return created;
}

export async function deleteAdminBanner(params: {
  adminUserId: number;
  id: number;
  ipAddress?: string | null;
}) {
  const [deleted] = await db.delete(banners).where(eq(banners.id, params.id)).returning();
  if (!deleted) {
    throw new AdminServiceError('BANNER_NOT_FOUND', 'Không tìm thấy banner.', 404);
  }
  await db.insert(adminLogs).values({
    adminUserId: params.adminUserId,
    action: 'CMS_BANNER_DELETED',
    targetType: 'BANNER',
    targetId: String(deleted.id),
    detailsJson: { title: deleted.title },
    ipAddress: params.ipAddress || null,
  });
  return { deletedId: deleted.id };
}

export async function listAdminCategories() {
  return db
    .select()
    .from(categories)
    .where(isNull(categories.deletedAt))
    .orderBy(asc(categories.sortOrder), asc(categories.id));
}

export async function updateAdminCategory(params: {
  adminUserId: number;
  id: number;
  name?: string;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  ipAddress?: string | null;
}) {
  const [updated] = await db
    .update(categories)
    .set({
      ...(params.name ? { name: params.name } : {}),
      ...(params.description !== undefined ? { description: params.description } : {}),
      ...(params.sortOrder !== undefined ? { sortOrder: params.sortOrder } : {}),
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      updatedAt: new Date(),
    })
    .where(eq(categories.id, params.id))
    .returning();

  if (!updated) {
    throw new AdminServiceError('CATEGORY_NOT_FOUND', 'Không tìm thấy danh mục.', 404);
  }

  await db.insert(adminLogs).values({
    adminUserId: params.adminUserId,
    action: 'CMS_CATEGORY_UPDATED',
    targetType: 'CATEGORY',
    targetId: String(updated.id),
    detailsJson: { name: updated.name, sortOrder: updated.sortOrder, isActive: updated.isActive },
    ipAddress: params.ipAddress || null,
  });

  return updated;
}

export async function listAdminSiteSettings() {
  return db.select().from(siteSettings).orderBy(asc(siteSettings.groupName), asc(siteSettings.key));
}

export async function upsertSiteSettingsBatch(params: {
  adminUserId: number;
  items: Array<{ key: string; value: string; groupName?: string; description?: string }>;
  ipAddress?: string | null;
}) {
  return db.transaction(async (tx) => {
    for (const item of params.items) {
      await tx
        .insert(siteSettings)
        .values({
          key: item.key,
          value: item.value,
          groupName: item.groupName || 'GENERAL',
          description: item.description || null,
          updatedBy: params.adminUserId,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: siteSettings.key,
          set: {
            value: item.value,
            updatedBy: params.adminUserId,
            updatedAt: new Date(),
          },
        });
    }

    await tx.insert(adminLogs).values({
      adminUserId: params.adminUserId,
      action: 'CMS_SETTINGS_UPDATED',
      targetType: 'SITE_SETTINGS',
      targetId: 'BATCH',
      detailsJson: { keys: params.items.map((i) => i.key) },
      ipAddress: params.ipAddress || null,
    });

    return tx.select().from(siteSettings).orderBy(asc(siteSettings.groupName), asc(siteSettings.key));
  });
}

// ============================================================================
// SUPPORT TICKETS MANAGEMENT
// ============================================================================

export async function listAdminSupportTickets(statusFilter?: string) {
  return db
    .select()
    .from(supportTickets)
    .where(
      statusFilter && statusFilter !== 'ALL'
        ? eq(supportTickets.status, statusFilter)
        : undefined
    )
    .orderBy(desc(supportTickets.createdAt))
    .limit(80);
}

export async function updateAdminSupportTicket(params: {
  adminUserId: number;
  ticketId: number;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  replyMessage?: string | null;
  ipAddress?: string | null;
}) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.id, params.ticketId))
      .limit(1);

    if (!existing) {
      throw new AdminServiceError('TICKET_NOT_FOUND', 'Không tìm thấy phiếu hỗ trợ.', 404);
    }

    const [updated] = await tx
      .update(supportTickets)
      .set({
        status: params.status,
        assignedTo: params.adminUserId,
        updatedAt: new Date(),
      })
      .where(eq(supportTickets.id, existing.id))
      .returning();

    if (existing.userId && params.replyMessage?.trim()) {
      await tx.insert(notifications).values({
        userId: existing.userId,
        type: 'SUPPORT',
        title: `Phản hồi phiếu hỗ trợ #${existing.ticketCode}`,
        body: `${params.replyMessage.trim()} (Trạng thái: ${params.status})`,
        linkUrl: '/tai-khoan?tab=notifications',
      });
    }

    await tx.insert(adminLogs).values({
      adminUserId: params.adminUserId,
      action: 'SUPPORT_TICKET_UPDATED',
      targetType: 'SUPPORT_TICKET',
      targetId: existing.ticketCode,
      detailsJson: {
        previousStatus: existing.status,
        nextStatus: params.status,
        replyMessage: params.replyMessage || null,
      },
      ipAddress: params.ipAddress || null,
    });

    return updated;
  });
}

// ============================================================================
// AUDIT & ADMIN LOGS VIEWER
// ============================================================================

export async function listAdminAndAuditLogs() {
  const [recentAdminLogs, recentAuditLogs] = await Promise.all([
    db
      .select({
        id: adminLogs.id,
        action: adminLogs.action,
        targetType: adminLogs.targetType,
        targetId: adminLogs.targetId,
        detailsJson: adminLogs.detailsJson,
        ipAddress: adminLogs.ipAddress,
        createdAt: adminLogs.createdAt,
        actorEmail: users.email,
        actorName: users.fullName,
      })
      .from(adminLogs)
      .innerJoin(users, eq(adminLogs.adminUserId, users.id))
      .orderBy(desc(adminLogs.createdAt))
      .limit(60),
    db
      .select({
        id: auditLogs.id,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        action: auditLogs.action,
        afterJson: auditLogs.afterJson,
        ipAddress: auditLogs.ipAddress,
        createdAt: auditLogs.createdAt,
        actorEmail: users.email,
        actorName: users.fullName,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(60),
  ]);

  return {
    adminLogs: recentAdminLogs,
    auditLogs: recentAuditLogs,
  };
}
