import { and, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  adminLogs,
  auditLogs,
  categories,
  notifications,
  priceChangeLogs,
  products,
  roles,
  userProductPrices,
  userRoles,
  users,
} from '../../db/schema.ts';

export type PriceSource = 'FREE' | 'ACCOUNT_CUSTOM' | 'LISTED';

export interface ResolvedPrice {
  listedPriceVnd: number;
  effectivePriceVnd: number;
  priceSource: PriceSource;
  hasCustomPrice: boolean;
  discountPercent: number;
  customEndsAt: Date | null;
}

export async function resolveEffectivePricesMap(
  productItems: Array<{ id: number; listedPriceVnd: number; isFree: boolean }>,
  userId?: number
): Promise<Map<number, ResolvedPrice>> {
  const result = new Map<number, ResolvedPrice>();
  if (productItems.length === 0) return result;

  const customPriceMap = new Map<number, { customPriceVnd: number; endsAt: Date | null }>();

  if (userId) {
    const productIds = productItems.map((p) => p.id);
    const now = new Date();
    const customRows = await db
      .select()
      .from(userProductPrices)
      .where(
        and(
          eq(userProductPrices.userId, userId),
          eq(userProductPrices.isActive, true),
          inArray(userProductPrices.productId, productIds)
        )
      );

    for (const row of customRows) {
      const startsOk = !row.startsAt || row.startsAt <= now;
      const endsOk = !row.endsAt || row.endsAt >= now;
      if (startsOk && endsOk) {
        customPriceMap.set(row.productId, {
          customPriceVnd: row.customPriceVnd,
          endsAt: row.endsAt,
        });
      }
    }
  }

  for (const item of productItems) {
    if (item.isFree || item.listedPriceVnd <= 0) {
      result.set(item.id, {
        listedPriceVnd: 0,
        effectivePriceVnd: 0,
        priceSource: 'FREE',
        hasCustomPrice: false,
        discountPercent: 0,
        customEndsAt: null,
      });
      continue;
    }

    const custom = customPriceMap.get(item.id);
    if (custom) {
      const discountPercent =
        item.listedPriceVnd > custom.customPriceVnd
          ? Math.round(((item.listedPriceVnd - custom.customPriceVnd) / item.listedPriceVnd) * 100)
          : 0;
      result.set(item.id, {
        listedPriceVnd: item.listedPriceVnd,
        effectivePriceVnd: custom.customPriceVnd,
        priceSource: 'ACCOUNT_CUSTOM',
        hasCustomPrice: true,
        discountPercent,
        customEndsAt: custom.endsAt,
      });
    } else {
      result.set(item.id, {
        listedPriceVnd: item.listedPriceVnd,
        effectivePriceVnd: item.listedPriceVnd,
        priceSource: 'LISTED',
        hasCustomPrice: false,
        discountPercent: 0,
        customEndsAt: null,
      });
    }
  }

  return result;
}

// ============================================================================
// STAGE 2: ACCOUNT-SPECIFIC PRICING MANAGEMENT (ADMIN)
// ============================================================================

export async function searchAccountsForPricing(q: string) {
  const cleanQ = q.trim();
  const baseQuery = db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      phone: users.phone,
      status: users.status,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(
      cleanQ
        ? and(
            isNull(users.deletedAt),
            or(
              ilike(users.fullName, `%${cleanQ}%`),
              ilike(users.email, `%${cleanQ}%`),
              ilike(users.phone, `%${cleanQ}%`)
            )
          )
        : isNull(users.deletedAt)
    )
    .orderBy(desc(users.id))
    .limit(25);

  const userRows = await baseQuery;
  if (userRows.length === 0) return [];

  const userIds = userRows.map((u) => u.id);
  const roleRows = await db
    .select({
      userId: userRoles.userId,
      roleCode: roles.code,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(inArray(userRoles.userId, userIds));

  const rolesByUser = new Map<number, string[]>();
  for (const r of roleRows) {
    const arr = rolesByUser.get(r.userId) || [];
    arr.push(r.roleCode);
    rolesByUser.set(r.userId, arr);
  }

  return userRows.map((u) => ({
    ...u,
    roles: rolesByUser.get(u.id) || ['MEMBER'],
  }));
}

export async function listAccountCustomPrices(filters: {
  userId?: number;
  productId?: number;
  activeOnly?: boolean;
}) {
  const conditions = [];
  if (filters.userId) conditions.push(eq(userProductPrices.userId, filters.userId));
  if (filters.productId) conditions.push(eq(userProductPrices.productId, filters.productId));
  if (filters.activeOnly) conditions.push(eq(userProductPrices.isActive, true));

  const rows = await db
    .select({
      id: userProductPrices.id,
      userId: userProductPrices.userId,
      productId: userProductPrices.productId,
      customPriceVnd: userProductPrices.customPriceVnd,
      startsAt: userProductPrices.startsAt,
      endsAt: userProductPrices.endsAt,
      note: userProductPrices.note,
      isActive: userProductPrices.isActive,
      updatedAt: userProductPrices.updatedAt,
      userFullName: users.fullName,
      userEmail: users.email,
      userPhone: users.phone,
      productCode: products.code,
      productSlug: products.slug,
      productTitle: products.title,
      listedPriceVnd: products.listedPriceVnd,
      fileFormat: products.fileFormat,
      thumbnailUrl: products.thumbnailUrl,
    })
    .from(userProductPrices)
    .innerJoin(users, eq(userProductPrices.userId, users.id))
    .innerJoin(products, eq(userProductPrices.productId, products.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(userProductPrices.updatedAt))
    .limit(100);

  return rows;
}

export async function upsertAccountCustomPrice(params: {
  userId: number;
  productId: number;
  customPriceVnd: number;
  startsAt?: Date | null;
  endsAt?: Date | null;
  note?: string | null;
  reason?: string | null;
  adminUserId: number;
  ipAddress?: string | null;
}) {
  if (params.customPriceVnd < 0) {
    throw new Error('Giá riêng không được nhỏ hơn 0 VND.');
  }
  if (params.startsAt && params.endsAt && params.endsAt < params.startsAt) {
    throw new Error('Ngày kết thúc phải sau ngày bắt đầu.');
  }

  return db.transaction(async (tx) => {
    const [targetUser] = await tx
      .select({ id: users.id, fullName: users.fullName, email: users.email })
      .from(users)
      .where(eq(users.id, params.userId))
      .limit(1);

    if (!targetUser) throw new Error('Không tìm thấy tài khoản.');

    const [targetProduct] = await tx
      .select({
        id: products.id,
        code: products.code,
        title: products.title,
        listedPriceVnd: products.listedPriceVnd,
      })
      .from(products)
      .where(eq(products.id, params.productId))
      .limit(1);

    if (!targetProduct) throw new Error('Không tìm thấy bản vẽ.');

    const [existing] = await tx
      .select()
      .from(userProductPrices)
      .where(
        and(
          eq(userProductPrices.userId, params.userId),
          eq(userProductPrices.productId, params.productId)
        )
      )
      .limit(1);

    const previousPriceVnd = existing
      ? existing.customPriceVnd
      : targetProduct.listedPriceVnd;

    const [saved] = await tx
      .insert(userProductPrices)
      .values({
        userId: params.userId,
        productId: params.productId,
        customPriceVnd: params.customPriceVnd,
        startsAt: params.startsAt ?? null,
        endsAt: params.endsAt ?? null,
        note: params.note ?? null,
        isActive: true,
        createdBy: params.adminUserId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [userProductPrices.userId, userProductPrices.productId],
        set: {
          customPriceVnd: params.customPriceVnd,
          startsAt: params.startsAt ?? null,
          endsAt: params.endsAt ?? null,
          note: params.note ?? null,
          isActive: true,
          updatedAt: new Date(),
        },
      })
      .returning();

    await tx.insert(priceChangeLogs).values({
      userId: params.userId,
      productId: params.productId,
      previousPriceVnd,
      newPriceVnd: params.customPriceVnd,
      priceType: 'USER_CUSTOM',
      changedBy: params.adminUserId,
      reason: params.reason || params.note || 'Thiết lập giá riêng cho tài khoản',
    });

    await tx.insert(adminLogs).values({
      adminUserId: params.adminUserId,
      action: 'UPSERT_USER_CUSTOM_PRICE',
      targetType: 'USER_PRODUCT_PRICE',
      targetId: String(saved.id),
      detailsJson: {
        userId: params.userId,
        productId: params.productId,
        productCode: targetProduct.code,
        previousPriceVnd,
        newPriceVnd: params.customPriceVnd,
      },
      ipAddress: params.ipAddress || null,
    });

    await tx.insert(auditLogs).values({
      actorUserId: params.adminUserId,
      entityType: 'USER_PRODUCT_PRICE',
      entityId: String(saved.id),
      action: existing ? 'UPDATED' : 'CREATED',
      beforeJson: existing ? { customPriceVnd: existing.customPriceVnd } : null,
      afterJson: { customPriceVnd: params.customPriceVnd, startsAt: params.startsAt, endsAt: params.endsAt },
      ipAddress: params.ipAddress || null,
    });

    await tx.insert(notifications).values({
      userId: params.userId,
      type: 'SYSTEM',
      title: `Chính sách giá riêng cho bản vẽ ${targetProduct.code}`,
      body: `Tài khoản của bạn được áp dụng giá ưu đãi ${new Intl.NumberFormat('vi-VN').format(
        params.customPriceVnd
      )} ₫ cho hồ sơ "${targetProduct.title}".`,
      linkUrl: `/tai-khoan?tab=custom-prices`,
    });

    return saved;
  });
}

export async function removeAccountCustomPrice(params: {
  priceId: number;
  adminUserId: number;
  reason?: string | null;
  ipAddress?: string | null;
}) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(userProductPrices)
      .where(eq(userProductPrices.id, params.priceId))
      .limit(1);

    if (!existing) {
      throw new Error('Không tìm thấy chính sách giá riêng.');
    }

    const [targetProduct] = await tx
      .select({ listedPriceVnd: products.listedPriceVnd, code: products.code })
      .from(products)
      .where(eq(products.id, existing.productId))
      .limit(1);

    await tx
      .update(userProductPrices)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(userProductPrices.id, existing.id));

    await tx.insert(priceChangeLogs).values({
      userId: existing.userId,
      productId: existing.productId,
      previousPriceVnd: existing.customPriceVnd,
      newPriceVnd: targetProduct?.listedPriceVnd ?? 0,
      priceType: 'REMOVED',
      changedBy: params.adminUserId,
      reason: params.reason || 'Xóa chính sách giá riêng (quay về giá niêm yết)',
    });

    await tx.insert(adminLogs).values({
      adminUserId: params.adminUserId,
      action: 'REMOVE_USER_CUSTOM_PRICE',
      targetType: 'USER_PRODUCT_PRICE',
      targetId: String(existing.id),
      detailsJson: {
        userId: existing.userId,
        productId: existing.productId,
        previousPriceVnd: existing.customPriceVnd,
      },
      ipAddress: params.ipAddress || null,
    });

    return { removedId: existing.id };
  });
}

export async function bulkApplyAccountPricing(params: {
  userIds: number[];
  productIds?: number[];
  categorySlug?: string;
  mode: 'FIXED_VND' | 'PERCENT_DISCOUNT';
  value: number;
  startsAt?: Date | null;
  endsAt?: Date | null;
  note?: string | null;
  reason?: string | null;
  adminUserId: number;
  ipAddress?: string | null;
}) {
  if (params.userIds.length === 0) {
    throw new Error('Vui lòng chọn ít nhất một tài khoản.');
  }
  if (params.mode === 'PERCENT_DISCOUNT' && (params.value <= 0 || params.value > 95)) {
    throw new Error('Tỷ lệ giảm giá phải nằm trong khoảng 1% đến 95%.');
  }
  if (params.mode === 'FIXED_VND' && params.value < 0) {
    throw new Error('Giá cố định không hợp lệ.');
  }

  return db.transaction(async (tx) => {
    let targetProducts: Array<{ id: number; code: string; listedPriceVnd: number; isFree: boolean }> = [];

    if (params.productIds && params.productIds.length > 0) {
      targetProducts = await tx
        .select({
          id: products.id,
          code: products.code,
          listedPriceVnd: products.listedPriceVnd,
          isFree: products.isFree,
        })
        .from(products)
        .where(and(inArray(products.id, params.productIds), isNull(products.deletedAt)));
    } else if (params.categorySlug && params.categorySlug !== 'all') {
      const [cat] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.slug, params.categorySlug))
        .limit(1);
      if (cat) {
        targetProducts = await tx
          .select({
            id: products.id,
            code: products.code,
            listedPriceVnd: products.listedPriceVnd,
            isFree: products.isFree,
          })
          .from(products)
          .where(and(eq(products.categoryId, cat.id), isNull(products.deletedAt)));
      }
    }

    const paidProducts = targetProducts.filter((p) => !p.isFree && p.listedPriceVnd > 0);
    if (paidProducts.length === 0) {
      throw new Error('Không có sản phẩm trả phí nào phù hợp để áp dụng giá hàng loạt.');
    }

    let updatedCount = 0;

    for (const userId of params.userIds) {
      for (const product of paidProducts) {
        const newPrice =
          params.mode === 'FIXED_VND'
            ? Math.round(params.value)
            : Math.max(0, Math.round((product.listedPriceVnd * (100 - params.value)) / 100));

        const [existing] = await tx
          .select()
          .from(userProductPrices)
          .where(
            and(
              eq(userProductPrices.userId, userId),
              eq(userProductPrices.productId, product.id)
            )
          )
          .limit(1);

        const prevPrice = existing ? existing.customPriceVnd : product.listedPriceVnd;

        await tx
          .insert(userProductPrices)
          .values({
            userId,
            productId: product.id,
            customPriceVnd: newPrice,
            startsAt: params.startsAt ?? null,
            endsAt: params.endsAt ?? null,
            note: params.note ?? null,
            isActive: true,
            createdBy: params.adminUserId,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [userProductPrices.userId, userProductPrices.productId],
            set: {
              customPriceVnd: newPrice,
              startsAt: params.startsAt ?? null,
              endsAt: params.endsAt ?? null,
              note: params.note ?? null,
              isActive: true,
              updatedAt: new Date(),
            },
          });

        await tx.insert(priceChangeLogs).values({
          userId,
          productId: product.id,
          previousPriceVnd: prevPrice,
          newPriceVnd: newPrice,
          priceType: 'BULK_UPDATE',
          changedBy: params.adminUserId,
          reason:
            params.reason ||
            `Cập nhật hàng loạt (${
              params.mode === 'PERCENT_DISCOUNT' ? `-${params.value}%` : `${params.value} VND`
            })`,
        });

        updatedCount += 1;
      }
    }

    await tx.insert(adminLogs).values({
      adminUserId: params.adminUserId,
      action: 'BULK_UPDATE_USER_PRICING',
      targetType: 'USER_PRODUCT_PRICE',
      targetId: `${params.userIds.length}_USERS_${paidProducts.length}_PRODUCTS`,
      detailsJson: {
        userIds: params.userIds,
        productCount: paidProducts.length,
        mode: params.mode,
        value: params.value,
        updatedCount,
      },
      ipAddress: params.ipAddress || null,
    });

    return { updatedCount, userCount: params.userIds.length, productCount: paidProducts.length };
  });
}

export async function listPriceChangeLogs(filters: { userId?: number; productId?: number }) {
  const conditions = [];
  if (filters.userId) conditions.push(eq(priceChangeLogs.userId, filters.userId));
  if (filters.productId) conditions.push(eq(priceChangeLogs.productId, filters.productId));

  const rows = await db
    .select({
      id: priceChangeLogs.id,
      userId: priceChangeLogs.userId,
      productId: priceChangeLogs.productId,
      previousPriceVnd: priceChangeLogs.previousPriceVnd,
      newPriceVnd: priceChangeLogs.newPriceVnd,
      priceType: priceChangeLogs.priceType,
      changedBy: priceChangeLogs.changedBy,
      reason: priceChangeLogs.reason,
      createdAt: priceChangeLogs.createdAt,
      productCode: products.code,
      productTitle: products.title,
    })
    .from(priceChangeLogs)
    .innerJoin(products, eq(priceChangeLogs.productId, products.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(priceChangeLogs.createdAt))
    .limit(100);

  const userIds = Array.from(
    new Set(
      rows.flatMap((r) => [r.userId, r.changedBy].filter((v): v is number => typeof v === 'number'))
    )
  );

  const userMap = new Map<number, { fullName: string; email: string }>();
  if (userIds.length > 0) {
    const uRows = await db
      .select({ id: users.id, fullName: users.fullName, email: users.email })
      .from(users)
      .where(inArray(users.id, userIds));
    for (const u of uRows) {
      userMap.set(u.id, { fullName: u.fullName, email: u.email });
    }
  }

  return rows.map((r) => ({
    ...r,
    targetUser: r.userId ? userMap.get(r.userId) || null : null,
    actorUser: userMap.get(r.changedBy) || null,
  }));
}
