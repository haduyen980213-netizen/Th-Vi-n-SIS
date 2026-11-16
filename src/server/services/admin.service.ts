import { and, asc, count, desc, eq, ilike, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  adminLogs,
  auditLogs,
  banners,
  categories,
  notifications,
  orderItems,
  orders,
  products,
  roles,
  sellers,
  siteSettings,
  supportTickets,
  topupOrders,
  userRoles,
  userSessions,
  users,
  wallets,
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

export async function listAdminUsers(params: { q?: string; status?: string }) {
  const q = params.q?.trim();
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

  const userRows = await db
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
    .orderBy(desc(users.createdAt))
    .limit(80);

  if (userRows.length === 0) return [];

  const roleRows = await db
    .select({
      userId: userRoles.userId,
      roleCode: roles.code,
      roleName: roles.name,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id));

  return userRows.map((u) => ({
    ...u,
    walletBalanceVnd: u.walletBalanceVnd ?? 0,
    roles: roleRows.filter((r) => r.userId === u.id).map((r) => r.roleCode),
  }));
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
