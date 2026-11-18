import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { and, asc, count, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  adminLogs,
  auditLogs,
  categories,
  downloadEntitlements,
  downloadLogs,
  emailLogs,
  favorites,
  notifications,
  orderItems,
  orders,
  paymentProviders,
  paymentReconciliations,
  productFiles,
  productImages,
  products,
  productTagRelations,
  productTags,
  productVersions,
  roles,
  sellers,
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
import { ensureDatabaseSeeded } from '../../db/seed.ts';
import {
  type AuthRequest,
  ensureInitialSuperAdmin,
  generateOpaqueToken,
  hashToken,
  optionalAuth,
  requireAuth,
  SESSION_COOKIE_NAME,
} from '../middleware/auth.ts';
import { rateLimit } from '../middleware/rateLimit.ts';
import { requirePermissions, requireRoles } from '../middleware/rbac.ts';
import {
  consumeSignedDownloadAndResolveFile,
  createSignedDownloadUrl,
  DownloadError,
} from '../services/download.service.ts';
import { openApiSpec } from '../services/openapi.ts';
import { checkoutOrder, CheckoutError } from '../services/order.service.ts';
import {
  adminConfirmTopupReconciliation,
  createQuickQrTopupOrder,
  getActiveReceivingBankConfig,
  processBankWebhookEvent,
  verifyWebhookHmacSignature,
} from '../services/payment-provider.service.ts';
import multer from 'multer';
import {
  bulkApplyAccountPricing,
  listAccountCustomPrices,
  listPriceChangeLogs,
  removeAccountCustomPrice,
  resolveEffectivePricesMap,
  searchAccountsForPricing,
  upsertAccountCustomPrice,
} from '../services/pricing.service.ts';
import {
  adjustUserWalletByAdmin,
  AdminServiceError,
  createAdminUser,
  deleteAdminBanner,
  getAdminAnalyticsReport,
  getAdminUserDetail,
  getPublicCmsHomeData,
  grantUserDrawingEntitlementByAdmin,
  listAdminAndAuditLogs,
  listAdminBanners,
  listAdminCategories,
  listAdminSiteSettings,
  listAdminSupportTickets,
  listAdminUsers,
  listAllRbacRoles,
  sendAdminDirectSupportToUser,
  updateAdminCategory,
  updateAdminSupportTicket,
  updateAdminUserProfileAndSecurity,
  updateAdminUserRolesAndStatus,
  upsertAdminBanner,
  upsertSiteSettingsBatch,
} from '../services/admin.service.ts';
import {
  createSellerPayoutRequest,
  createSellerProduct,
  getSellerByUserId,
  getSellerRevenueAndPayouts,
  listProductsForModeration,
  listSellerPayoutsForAdmin,
  listSellerProducts,
  moderateSellerProduct,
  processSellerPayoutByAdmin,
  publishSellerProductVersion,
  registerOrUpdateSellerProfile,
  SellerError,
  settlePendingSellerCommissions,
  updateSellerProduct,
} from '../services/seller.service.ts';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function isHttpsRequest(req: Request): boolean {
  return (
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production'
  );
}

function setSessionCookie(req: Request, res: Response, rawToken: string, expiresAt: Date) {
  const https = isHttpsRequest(req);
  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: https ? 'none' : 'lax',
    secure: https,
    expires: expiresAt,
    path: '/',
  });
}

function clearSessionCookie(req: Request, res: Response) {
  const https = isHttpsRequest(req);
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: https ? 'none' : 'lax',
    secure: https,
    path: '/',
  });
}

// Ensure seed runs once lazily when catalog/auth endpoints are hit
router.use(async (_req, _res, next) => {
  try {
    await ensureDatabaseSeeded();
    next();
  } catch (err) {
    console.error('Database seed check failed:', err);
    next();
  }
});

// ============================================================================
// SYSTEM & OPENAPI DOCS
// ============================================================================

router.get('/health', async (_req, res) => {
  try {
    const [{ total }] = await db.select({ total: count() }).from(categories);
    res.json({
      success: true,
      data: {
        service: 'THƯ VIỆN SIS API v1',
        status: 'OPERATIONAL',
        categoriesCount: total,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('Healthcheck error:', err);
    res.status(503).json({
      success: false,
      error: { code: 'DB_UNAVAILABLE', message: 'Không thể kết nối cơ sở dữ liệu.' },
    });
  }
});

router.get('/docs.json', (_req, res) => {
  res.json(openApiSpec);
});

// ============================================================================
// AUTHENTICATION & RBAC
// ============================================================================

const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Họ tên tối thiểu 2 ký tự').max(120),
  email: z.string().trim().email('Email không hợp lệ').toLowerCase(),
  phone: z
    .string()
    .trim()
    .regex(/^(0|\+84)[0-9]{8,10}$/, 'Số điện thoại Việt Nam không hợp lệ'),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').max(128),
});

router.post(
  '/auth/register',
  rateLimit({ windowMs: 60_000, max: 10, keyPrefix: 'auth_register' }),
  async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message || 'Dữ liệu đăng ký không hợp lệ.',
        },
      });
    }

    const { fullName, email, phone, password } = parsed.data;

    try {
      const existing = await db
        .select({ id: users.id, email: users.email, phone: users.phone })
        .from(users)
        .where(or(eq(users.email, email), eq(users.phone, phone)))
        .limit(1);

      if (existing.length > 0) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'ACCOUNT_EXISTS',
            message:
              existing[0].email === email
                ? 'Email này đã được sử dụng.'
                : 'Số điện thoại này đã được đăng ký.',
          },
        });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const emailVerifyToken = generateOpaqueToken();
      const uid = `local_${generateOpaqueToken().slice(0, 24)}`;

      const createdUser = await db.transaction(async (tx) => {
        const [userRow] = await tx
          .insert(users)
          .values({
            uid,
            email,
            phone,
            passwordHash,
            fullName,
            emailVerified: false,
            emailVerifyToken,
            status: 'ACTIVE',
            lastLoginAt: new Date(),
          })
          .returning();

        await tx.insert(userProfiles).values({ userId: userRow.id });
        await tx.insert(wallets).values({ userId: userRow.id });

        const [memberRole] = await tx
          .select()
          .from(roles)
          .where(eq(roles.code, 'MEMBER'))
          .limit(1);
        if (memberRole) {
          await tx.insert(userRoles).values({ userId: userRow.id, roleId: memberRole.id });
        }

        await tx.insert(emailLogs).values({
          recipientEmail: email,
          templateCode: 'EMAIL_VERIFICATION',
          subject: '[THƯ VIỆN SIS] Xác minh địa chỉ email tài khoản',
          status: 'QUEUED',
        });

        await tx.insert(auditLogs).values({
          actorUserId: userRow.id,
          entityType: 'USER',
          entityId: String(userRow.id),
          action: 'USER_REGISTERED',
          afterJson: { email, phone, fullName },
          ipAddress: req.ip || null,
        });

        return userRow;
      });

      const rawSessionToken = generateOpaqueToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.insert(userSessions).values({
        userId: createdUser.id,
        sessionTokenHash: hashToken(rawSessionToken),
        authProvider: 'LOCAL',
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
        expiresAt,
      });

      setSessionCookie(req, res, rawSessionToken, expiresAt);

      await ensureInitialSuperAdmin(createdUser.id, createdUser.email);
      const regRoles = await db
        .select({ code: roles.code })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.userId, createdUser.id));

      return res.status(201).json({
        success: true,
        data: {
          sessionToken: rawSessionToken,
          user: {
            id: createdUser.id,
            uid: createdUser.uid,
            email: createdUser.email,
            phone: createdUser.phone,
            fullName: createdUser.fullName,
            avatarUrl: createdUser.avatarUrl,
            emailVerified: createdUser.emailVerified,
            roles: regRoles.length > 0 ? regRoles.map((r) => r.code) : ['MEMBER'],
          },
          message: 'Đăng ký tài khoản THƯ VIỆN SIS thành công.',
        },
      });
    } catch (err) {
      console.error('Register error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể tạo tài khoản lúc này.' },
      });
    }
  }
);

const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'Vui lòng nhập email hoặc số điện thoại'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});

router.post(
  '/auth/login',
  rateLimit({ windowMs: 60_000, max: 15, keyPrefix: 'auth_login' }),
  async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message || 'Thông tin đăng nhập không hợp lệ.',
        },
      });
    }

    const identifier = parsed.data.identifier.toLowerCase();
    const password = parsed.data.password;

    try {
      const [userRow] = await db
        .select()
        .from(users)
        .where(
          and(
            or(eq(users.email, identifier), eq(users.phone, parsed.data.identifier)),
            isNull(users.deletedAt)
          )
        )
        .limit(1);

      if (!userRow || !userRow.passwordHash) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Email/số điện thoại hoặc mật khẩu không chính xác.',
          },
        });
      }

      if (userRow.status === 'LOCKED') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'ACCOUNT_LOCKED',
            message: 'Tài khoản này đã bị khóa. Vui lòng liên hệ bộ phận hỗ trợ.',
          },
        });
      }

      const validPassword = await bcrypt.compare(password, userRow.passwordHash);
      if (!validPassword) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Email/số điện thoại hoặc mật khẩu không chính xác.',
          },
        });
      }

      await db
        .update(users)
        .set({ lastLoginAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, userRow.id));

      const rawSessionToken = generateOpaqueToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.insert(userSessions).values({
        userId: userRow.id,
        sessionTokenHash: hashToken(rawSessionToken),
        authProvider: 'LOCAL',
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
        expiresAt,
      });

      setSessionCookie(req, res, rawSessionToken, expiresAt);

      await ensureInitialSuperAdmin(userRow.id, userRow.email);

      const userRoleRows = await db
        .select({ code: roles.code })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.userId, userRow.id));

      return res.json({
        success: true,
        data: {
          sessionToken: rawSessionToken,
          user: {
            id: userRow.id,
            uid: userRow.uid,
            email: userRow.email,
            phone: userRow.phone,
            fullName: userRow.fullName,
            avatarUrl: userRow.avatarUrl,
            emailVerified: userRow.emailVerified,
            roles: userRoleRows.map((r) => r.code),
          },
        },
      });
    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Lỗi xác thực hệ thống.' },
      });
    }
  }
);

router.post('/auth/firebase-sync', requireAuth, async (req: AuthRequest, res) => {
  const user = req.authUser!;
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, user.id)).limit(1);
  return res.json({
    success: true,
    data: {
      user,
      wallet: wallet || { availableBalanceVnd: 0, pendingBalanceVnd: 0, currency: 'VND' },
    },
  });
});

router.post('/auth/logout', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const rawCookie = req.cookies?.[SESSION_COOKIE_NAME];
    const authHeader = req.headers.authorization;
    const rawBearer =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length).trim()
        : '';

    for (const tokenCandidate of [rawCookie, rawBearer]) {
      if (typeof tokenCandidate === 'string' && tokenCandidate.length >= 32) {
        await db
          .update(userSessions)
          .set({ revokedAt: new Date() })
          .where(eq(userSessions.sessionTokenHash, hashToken(tokenCandidate)));
      }
    }
    clearSessionCookie(req, res);
    return res.json({ success: true, data: { message: 'Đã đăng xuất.' } });
  } catch (err) {
    console.error('Logout error:', err);
    clearSessionCookie(req, res);
    return res.json({ success: true });
  }
});

router.get('/auth/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.authUser!;
    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, user.id))
      .limit(1);
    const [wallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, user.id))
      .limit(1);

    return res.json({
      success: true,
      data: {
        user,
        profile: profile || null,
        wallet: wallet
          ? {
              availableBalanceVnd: wallet.availableBalanceVnd,
              pendingBalanceVnd: wallet.pendingBalanceVnd,
              totalDepositedVnd: wallet.totalDepositedVnd,
              totalSpentVnd: wallet.totalSpentVnd,
              currency: wallet.currency,
            }
          : {
              availableBalanceVnd: 0,
              pendingBalanceVnd: 0,
              totalDepositedVnd: 0,
              totalSpentVnd: 0,
              currency: 'VND',
            },
      },
    });
  } catch (err) {
    console.error('Fetch me error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Không thể tải thông tin tài khoản.' },
    });
  }
});

router.post(
  '/auth/forgot-password',
  rateLimit({ windowMs: 60_000, max: 5, keyPrefix: 'auth_forgot' }),
  async (req, res) => {
    const schema = z.object({ email: z.string().trim().email('Email không hợp lệ').toLowerCase() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Vui lòng nhập địa chỉ email hợp lệ.' },
      });
    }

    try {
      const [userRow] = await db
        .select()
        .from(users)
        .where(eq(users.email, parsed.data.email))
        .limit(1);

      if (userRow) {
        const resetToken = generateOpaqueToken();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        await db
          .update(users)
          .set({
            resetPasswordToken: hashToken(resetToken),
            resetPasswordExpiresAt: expiresAt,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userRow.id));

        await db.insert(emailLogs).values({
          recipientEmail: userRow.email,
          templateCode: 'PASSWORD_RESET',
          subject: '[THƯ VIỆN SIS] Hướng dẫn đặt lại mật khẩu',
          status: 'QUEUED',
        });
      }

      // Never reveal whether email exists to prevent enumeration
      return res.json({
        success: true,
        data: {
          message:
            'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi tới hộp thư của bạn.',
        },
      });
    } catch (err) {
      console.error('Forgot password error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể xử lý yêu cầu lúc này.' },
      });
    }
  }
);

router.post('/auth/change-password', requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    currentPassword: z.string().optional(),
    newPassword: z.string().min(8, 'Mật khẩu mới tối thiểu 8 ký tự').max(128),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message || 'Dữ liệu không hợp lệ.',
      },
    });
  }

  try {
    const [userRow] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.authUser!.id))
      .limit(1);

    if (!userRow) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Không tìm thấy tài khoản.' },
      });
    }

    if (userRow.passwordHash) {
      if (!parsed.data.currentPassword) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Vui lòng nhập mật khẩu hiện tại.' },
        });
      }
      const match = await bcrypt.compare(parsed.data.currentPassword, userRow.passwordHash);
      if (!match) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_PASSWORD', message: 'Mật khẩu hiện tại không đúng.' },
        });
      }
    }

    const newHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await db
      .update(users)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(users.id, userRow.id));

    await db.insert(auditLogs).values({
      actorUserId: userRow.id,
      entityType: 'USER',
      entityId: String(userRow.id),
      action: 'PASSWORD_CHANGED',
      ipAddress: req.ip || null,
    });

    return res.json({
      success: true,
      data: { message: 'Đổi mật khẩu thành công.' },
    });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Không thể cập nhật mật khẩu.' },
    });
  }
});

// ============================================================================
// USER PROFILE
// ============================================================================

const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^(0|\+84)[0-9]{8,10}$/, 'Số điện thoại Việt Nam không hợp lệ')
    .nullable()
    .optional(),
  companyName: z.string().trim().max(150).nullable().optional(),
  jobTitle: z.string().trim().max(100).nullable().optional(),
  taxCode: z.string().trim().max(30).nullable().optional(),
  address: z.string().trim().max(255).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  bio: z.string().trim().max(500).nullable().optional(),
});

router.patch('/users/profile', requireAuth, async (req: AuthRequest, res) => {
  const parsed = profileUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message || 'Thông tin hồ sơ không hợp lệ.',
      },
    });
  }

  try {
    const userId = req.authUser!.id;
    const data = parsed.data;

    if (data.fullName || data.phone !== undefined) {
      await db
        .update(users)
        .set({
          ...(data.fullName ? { fullName: data.fullName } : {}),
          ...(data.phone !== undefined ? { phone: data.phone } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    }

    await db
      .insert(userProfiles)
      .values({
        userId,
        companyName: data.companyName ?? null,
        jobTitle: data.jobTitle ?? null,
        taxCode: data.taxCode ?? null,
        address: data.address ?? null,
        city: data.city ?? null,
        bio: data.bio ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: {
          ...(data.companyName !== undefined ? { companyName: data.companyName } : {}),
          ...(data.jobTitle !== undefined ? { jobTitle: data.jobTitle } : {}),
          ...(data.taxCode !== undefined ? { taxCode: data.taxCode } : {}),
          ...(data.address !== undefined ? { address: data.address } : {}),
          ...(data.city !== undefined ? { city: data.city } : {}),
          ...(data.bio !== undefined ? { bio: data.bio } : {}),
          updatedAt: new Date(),
        },
      });

    return res.json({
      success: true,
      data: { message: 'Đã cập nhật hồ sơ cá nhân.' },
    });
  } catch (err) {
    console.error('Profile update error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Không thể lưu thay đổi hồ sơ.' },
    });
  }
});

// ============================================================================
// CATEGORIES & PRODUCTS (CATALOG + ACCOUNT-SPECIFIC PRICING)
// ============================================================================

router.get('/categories', async (_req, res) => {
  try {
    const catRows = await db
      .select()
      .from(categories)
      .where(and(eq(categories.isActive, true), isNull(categories.deletedAt)))
      .orderBy(asc(categories.sortOrder), asc(categories.id));

    const productCounts = await db
      .select({
        categoryId: products.categoryId,
        total: count(),
      })
      .from(products)
      .where(and(eq(products.approvalStatus, 'APPROVED'), isNull(products.deletedAt)))
      .groupBy(products.categoryId);

    const countMap = new Map(productCounts.map((c) => [c.categoryId, Number(c.total)]));

    return res.json({
      success: true,
      data: catRows.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        iconName: c.iconName,
        sortOrder: c.sortOrder,
        productCount: countMap.get(c.id) || 0,
      })),
    });
  } catch (err) {
    console.error('Categories error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Không thể tải danh mục bản vẽ.' },
    });
  }
});

router.get('/products', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const categorySlug = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const formatFilter = typeof req.query.format === 'string' ? req.query.format.trim() : '';
    const tagFilter = typeof req.query.tag === 'string' ? req.query.tag.trim() : '';
    const sortParam = typeof req.query.sort === 'string' ? req.query.sort.trim() : 'newest';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(48, Math.max(1, Number(req.query.limit) || 12));
    const offset = (page - 1) * limit;

    const conditions = [
      eq(products.approvalStatus, 'APPROVED'),
      isNull(products.deletedAt),
    ];

    if (q) {
      const pattern = `%${q}%`;
      conditions.push(
        or(
          ilike(products.title, pattern),
          ilike(products.code, pattern),
          ilike(products.summary, pattern),
          ilike(products.fileFormat, pattern)
        )!
      );
    }

    if (categorySlug && categorySlug !== 'all') {
      const [cat] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.slug, categorySlug))
        .limit(1);
      if (cat) {
        conditions.push(eq(products.categoryId, cat.id));
      } else {
        return res.json({
          success: true,
          data: { items: [], pagination: { page, limit, total: 0, totalPages: 0 } },
        });
      }
    }

    if (formatFilter && formatFilter !== 'all') {
      conditions.push(ilike(products.fileFormat, `%${formatFilter}%`));
    }

    if (tagFilter === 'free') {
      conditions.push(eq(products.isFree, true));
    } else if (tagFilter === 'featured') {
      conditions.push(eq(products.isFeatured, true));
    }

    let orderClause = desc(products.createdAt);
    if (sortParam === 'popular') orderClause = desc(products.purchaseCount);
    else if (sortParam === 'views') orderClause = desc(products.viewCount);
    else if (sortParam === 'price_asc') orderClause = asc(products.listedPriceVnd);
    else if (sortParam === 'price_desc') orderClause = desc(products.listedPriceVnd);

    const [{ total }] = await db
      .select({ total: count() })
      .from(products)
      .where(and(...conditions));

    const rows = await db
      .select({
        id: products.id,
        code: products.code,
        slug: products.slug,
        title: products.title,
        summary: products.summary,
        listedPriceVnd: products.listedPriceVnd,
        isFree: products.isFree,
        fileFormat: products.fileFormat,
        softwareVersion: products.softwareVersion,
        fileSizeLabel: products.fileSizeLabel,
        pageOrSheetCount: products.pageOrSheetCount,
        thumbnailUrl: products.thumbnailUrl,
        approvalStatus: products.approvalStatus,
        isFeatured: products.isFeatured,
        viewCount: products.viewCount,
        purchaseCount: products.purchaseCount,
        downloadCount: products.downloadCount,
        ratingAvg: products.ratingAvg,
        publishedAt: products.publishedAt,
        createdAt: products.createdAt,
        categoryId: categories.id,
        categoryName: categories.name,
        categorySlug: categories.slug,
        sellerId: sellers.id,
        sellerName: sellers.displayName,
        sellerSlug: sellers.slug,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .innerJoin(sellers, eq(products.sellerId, sellers.id))
      .where(and(...conditions))
      .orderBy(orderClause, desc(products.id))
      .limit(limit)
      .offset(offset);

    const pricesMap = await resolveEffectivePricesMap(rows, req.authUser?.id);

    const items = rows.map((row) => {
      const priceInfo = pricesMap.get(row.id)!;
      return {
        id: row.id,
        code: row.code,
        slug: row.slug,
        title: row.title,
        summary: row.summary,
        fileFormat: row.fileFormat,
        softwareVersion: row.softwareVersion,
        fileSizeLabel: row.fileSizeLabel,
        pageOrSheetCount: row.pageOrSheetCount,
        thumbnailUrl: row.thumbnailUrl,
        approvalStatus: row.approvalStatus,
        isFeatured: row.isFeatured,
        isFree: row.isFree,
        viewCount: row.viewCount,
        purchaseCount: row.purchaseCount,
        downloadCount: row.downloadCount,
        ratingAvg: Number((row.ratingAvg / 10).toFixed(1)),
        publishedAt: row.publishedAt || row.createdAt,
        category: {
          id: row.categoryId,
          name: row.categoryName,
          slug: row.categorySlug,
        },
        seller: {
          id: row.sellerId,
          displayName: row.sellerName,
          slug: row.sellerSlug,
        },
        pricing: priceInfo,
      };
    });

    return res.json({
      success: true,
      data: {
        items,
        pagination: {
          page,
          limit,
          total: Number(total),
          totalPages: Math.ceil(Number(total) / limit),
        },
      },
    });
  } catch (err) {
    console.error('Products list error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Không thể tải danh sách bản vẽ.' },
    });
  }
});

router.get('/products/:slug', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const slug = String(req.params.slug);
    const [row] = await db
      .select({
        id: products.id,
        code: products.code,
        slug: products.slug,
        title: products.title,
        summary: products.summary,
        description: products.description,
        listedPriceVnd: products.listedPriceVnd,
        isFree: products.isFree,
        fileFormat: products.fileFormat,
        softwareVersion: products.softwareVersion,
        fileSizeBytes: products.fileSizeBytes,
        fileSizeLabel: products.fileSizeLabel,
        pageOrSheetCount: products.pageOrSheetCount,
        thumbnailUrl: products.thumbnailUrl,
        approvalStatus: products.approvalStatus,
        isFeatured: products.isFeatured,
        viewCount: products.viewCount,
        purchaseCount: products.purchaseCount,
        downloadCount: products.downloadCount,
        ratingAvg: products.ratingAvg,
        publishedAt: products.publishedAt,
        createdAt: products.createdAt,
        categoryId: categories.id,
        categoryName: categories.name,
        categorySlug: categories.slug,
        sellerId: sellers.id,
        sellerName: sellers.displayName,
        sellerSlug: sellers.slug,
        sellerSpecialty: sellers.specialty,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .innerJoin(sellers, eq(products.sellerId, sellers.id))
      .where(
        and(
          eq(products.slug, slug),
          eq(products.approvalStatus, 'APPROVED'),
          isNull(products.deletedAt)
        )
      )
      .limit(1);

    if (!row) {
      return res.status(404).json({
        success: false,
        error: { code: 'PRODUCT_NOT_FOUND', message: 'Không tìm thấy hồ sơ bản vẽ này.' },
      });
    }

    // Increment view counter safely
    await db
      .update(products)
      .set({ viewCount: sql`${products.viewCount} + 1` })
      .where(eq(products.id, row.id));

    const images = await db
      .select({
        id: productImages.id,
        imageUrl: productImages.imageUrl,
        caption: productImages.caption,
        sortOrder: productImages.sortOrder,
      })
      .from(productImages)
      .where(eq(productImages.productId, row.id))
      .orderBy(asc(productImages.sortOrder));

    // Only expose safe file metadata (never expose private storageKey!)
    const files = await db
      .select({
        id: productFiles.id,
        originalFilename: productFiles.originalFilename,
        sizeBytes: productFiles.sizeBytes,
        versionLabel: productFiles.versionLabel,
      })
      .from(productFiles)
      .where(eq(productFiles.productId, row.id));

    const versions = await db
      .select({
        id: productVersions.id,
        versionNumber: productVersions.versionNumber,
        changelog: productVersions.changelog,
        createdAt: productVersions.createdAt,
      })
      .from(productVersions)
      .where(eq(productVersions.productId, row.id))
      .orderBy(desc(productVersions.createdAt));

    const tagRows = await db
      .select({ name: productTags.name, slug: productTags.slug })
      .from(productTagRelations)
      .innerJoin(productTags, eq(productTagRelations.tagId, productTags.id))
      .where(eq(productTagRelations.productId, row.id));

    let isFavorited = false;
    let entitlementInfo: {
      id: number;
      maxDownloads: number;
      downloadsUsed: number;
      expiresAt: Date | null;
      isRevoked: boolean;
    } | null = null;

    if (req.authUser) {
      const [fav] = await db
        .select({ id: favorites.id })
        .from(favorites)
        .where(and(eq(favorites.userId, req.authUser.id), eq(favorites.productId, row.id)))
        .limit(1);
      isFavorited = Boolean(fav);

      const [ent] = await db
        .select({
          id: downloadEntitlements.id,
          maxDownloads: downloadEntitlements.maxDownloads,
          downloadsUsed: downloadEntitlements.downloadsUsed,
          expiresAt: downloadEntitlements.expiresAt,
          isRevoked: downloadEntitlements.isRevoked,
        })
        .from(downloadEntitlements)
        .where(
          and(
            eq(downloadEntitlements.userId, req.authUser.id),
            eq(downloadEntitlements.productId, row.id)
          )
        )
        .limit(1);

      if (ent && !ent.isRevoked && (!ent.expiresAt || ent.expiresAt > new Date())) {
        entitlementInfo = ent;
      }
    }

    const pricesMap = await resolveEffectivePricesMap([row], req.authUser?.id);

    return res.json({
      success: true,
      data: {
        id: row.id,
        code: row.code,
        slug: row.slug,
        title: row.title,
        summary: row.summary,
        description: row.description,
        fileFormat: row.fileFormat,
        softwareVersion: row.softwareVersion,
        fileSizeLabel: row.fileSizeLabel,
        pageOrSheetCount: row.pageOrSheetCount,
        thumbnailUrl: row.thumbnailUrl,
        approvalStatus: row.approvalStatus,
        isFeatured: row.isFeatured,
        isFree: row.isFree,
        viewCount: row.viewCount + 1,
        purchaseCount: row.purchaseCount,
        downloadCount: row.downloadCount,
        ratingAvg: Number((row.ratingAvg / 10).toFixed(1)),
        publishedAt: row.publishedAt || row.createdAt,
        category: {
          id: row.categoryId,
          name: row.categoryName,
          slug: row.categorySlug,
        },
        seller: {
          id: row.sellerId,
          displayName: row.sellerName,
          slug: row.sellerSlug,
          specialty: row.sellerSpecialty,
        },
        images,
        files,
        versions,
        tags: tagRows,
        isFavorited,
        hasEntitlement: Boolean(entitlementInfo),
        entitlement: entitlementInfo,
        pricing: pricesMap.get(row.id)!,
      },
    });
  } catch (err) {
    console.error('Product detail error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Không thể tải chi tiết bản vẽ.' },
    });
  }
});

// ============================================================================
// FAVORITES (MEMBER+)
// ============================================================================

router.get('/favorites', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select({
        favoriteId: favorites.id,
        savedAt: favorites.createdAt,
        id: products.id,
        code: products.code,
        slug: products.slug,
        title: products.title,
        summary: products.summary,
        listedPriceVnd: products.listedPriceVnd,
        isFree: products.isFree,
        fileFormat: products.fileFormat,
        fileSizeLabel: products.fileSizeLabel,
        thumbnailUrl: products.thumbnailUrl,
        categoryName: categories.name,
        categorySlug: categories.slug,
      })
      .from(favorites)
      .innerJoin(products, eq(favorites.productId, products.id))
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(and(eq(favorites.userId, req.authUser!.id), isNull(products.deletedAt)))
      .orderBy(desc(favorites.createdAt));

    const pricesMap = await resolveEffectivePricesMap(rows, req.authUser!.id);

    return res.json({
      success: true,
      data: rows.map((r) => ({
        ...r,
        pricing: pricesMap.get(r.id)!,
      })),
    });
  } catch (err) {
    console.error('Favorites list error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Không thể tải danh sách yêu thích.' },
    });
  }
});

router.post('/favorites/:productId', requireAuth, async (req: AuthRequest, res) => {
  const productId = Number(req.params.productId);
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Mã bản vẽ không hợp lệ.' },
    });
  }

  try {
    await db
      .insert(favorites)
      .values({ userId: req.authUser!.id, productId })
      .onConflictDoNothing();
    return res.json({ success: true, data: { favorited: true } });
  } catch (err) {
    console.error('Favorite add error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Không thể lưu yêu thích.' },
    });
  }
});

router.delete('/favorites/:productId', requireAuth, async (req: AuthRequest, res) => {
  const productId = Number(req.params.productId);
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Mã bản vẽ không hợp lệ.' },
    });
  }

  try {
    await db
      .delete(favorites)
      .where(and(eq(favorites.userId, req.authUser!.id), eq(favorites.productId, productId)));
    return res.json({ success: true, data: { favorited: false } });
  } catch (err) {
    console.error('Favorite remove error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Không thể bỏ yêu thích.' },
    });
  }
});

// ============================================================================
// SUPPORT TICKETS
// ============================================================================

const ticketSchema = z.object({
  contactName: z.string().trim().min(2, 'Vui lòng nhập họ tên'),
  contactEmail: z.string().trim().email('Email liên hệ không hợp lệ'),
  category: z.enum(['PAYMENT', 'DOWNLOAD', 'SELLER', 'ACCOUNT', 'OTHER']),
  subject: z.string().trim().min(5, 'Tiêu đề tối thiểu 5 ký tự').max(150),
  message: z.string().trim().min(10, 'Nội dung tối thiểu 10 ký tự').max(2000),
});

router.post(
  '/support/tickets',
  optionalAuth,
  rateLimit({ windowMs: 60_000, max: 5, keyPrefix: 'support_ticket' }),
  async (req: AuthRequest, res) => {
    const parsed = ticketSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message || 'Nội dung hỗ trợ không hợp lệ.',
        },
      });
    }

    try {
      const code = `SUP-${Date.now().toString().slice(-6)}`;
      const [ticket] = await db
        .insert(supportTickets)
        .values({
          ticketCode: code,
          userId: req.authUser?.id ?? null,
          contactName: parsed.data.contactName,
          contactEmail: parsed.data.contactEmail,
          category: parsed.data.category,
          subject: parsed.data.subject,
          message: parsed.data.message,
          status: 'OPEN',
        })
        .returning();

      return res.status(201).json({
        success: true,
        data: {
          ticketCode: ticket.ticketCode,
          status: ticket.status,
          message: `Đã tiếp nhận yêu cầu hỗ trợ #${ticket.ticketCode}.`,
        },
      });
    } catch (err) {
      console.error('Support ticket error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể gửi yêu cầu hỗ trợ.' },
      });
    }
  }
);

// ============================================================================
// RBAC VERIFICATION SAMPLE ROUTE FOR STAGE 1 ACCEPTANCE
// ============================================================================

router.get(
  '/admin/rbac-check',
  requireAuth,
  requireRoles('ADMIN', 'SUPER_ADMIN'),
  (_req, res) => {
    res.json({
      success: true,
      data: { authorized: true, message: 'Xác thực phân quyền quản trị thành công.' },
    });
  }
);

// ============================================================================
// STAGE 2: USER DASHBOARD (CUSTOM PRICES, ORDERS, DOWNLOADS, NOTIFICATIONS)
// ============================================================================

router.get('/users/me/custom-prices', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await listAccountCustomPrices({
      userId: req.authUser!.id,
      activeOnly: true,
    });
    const now = new Date();
    const activeValid = rows.filter((r) => {
      const sOk = !r.startsAt || r.startsAt <= now;
      const eOk = !r.endsAt || r.endsAt >= now;
      return sOk && eOk;
    });
    return res.json({ success: true, data: activeValid });
  } catch (err) {
    console.error('Fetch my custom prices error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Không thể tải danh sách giá ưu đãi.' },
    });
  }
});

router.get('/users/me/orders', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orderRows = await db
      .select()
      .from(orders)
      .where(eq(orders.buyerId, req.authUser!.id))
      .orderBy(desc(orders.createdAt))
      .limit(50);

    if (orderRows.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const itemsRows = await db
      .select({
        id: orderItems.id,
        orderId: orderItems.orderId,
        productId: orderItems.productId,
        unitPriceSnapshotVnd: orderItems.unitPriceSnapshotVnd,
        priceSource: orderItems.priceSource,
        productCode: products.code,
        productSlug: products.slug,
        productTitle: products.title,
      })
      .from(orderItems)
      .innerJoin(products, eq(orderItems.productId, products.id))
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(eq(orders.buyerId, req.authUser!.id));

    return res.json({
      success: true,
      data: orderRows.map((o) => ({
        ...o,
        items: itemsRows.filter((i) => i.orderId === o.id),
      })),
    });
  } catch (err) {
    console.error('Fetch orders error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Không thể tải lịch sử đơn hàng.' },
    });
  }
});

router.get('/users/me/downloads', requireAuth, async (req: AuthRequest, res) => {
  try {
    const entitlements = await db
      .select({
        id: downloadEntitlements.id,
        productId: downloadEntitlements.productId,
        maxDownloads: downloadEntitlements.maxDownloads,
        downloadsUsed: downloadEntitlements.downloadsUsed,
        grantedAt: downloadEntitlements.grantedAt,
        productCode: products.code,
        productSlug: products.slug,
        productTitle: products.title,
        fileFormat: products.fileFormat,
        fileSizeLabel: products.fileSizeLabel,
      })
      .from(downloadEntitlements)
      .innerJoin(products, eq(downloadEntitlements.productId, products.id))
      .where(eq(downloadEntitlements.userId, req.authUser!.id))
      .orderBy(desc(downloadEntitlements.grantedAt));

    const logs = await db
      .select({
        id: downloadLogs.id,
        productId: downloadLogs.productId,
        downloadedAt: downloadLogs.downloadedAt,
        productCode: products.code,
        productTitle: products.title,
      })
      .from(downloadLogs)
      .innerJoin(products, eq(downloadLogs.productId, products.id))
      .where(eq(downloadLogs.userId, req.authUser!.id))
      .orderBy(desc(downloadLogs.downloadedAt))
      .limit(50);

    return res.json({ success: true, data: { entitlements, logs } });
  } catch (err) {
    console.error('Fetch downloads error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Không thể tải lịch sử tải bản vẽ.' },
    });
  }
});

router.get('/notifications', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, req.authUser!.id))
      .orderBy(desc(notifications.createdAt))
      .limit(40);
    const unreadCount = rows.filter((n) => !n.isRead).length;
    return res.json({ success: true, data: { items: rows, unreadCount } });
  } catch (err) {
    console.error('Notifications error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Không thể tải thông báo.' },
    });
  }
});

router.patch('/notifications/read-all', requireAuth, async (req: AuthRequest, res) => {
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.userId, req.authUser!.id));
  return res.json({ success: true });
});

router.patch('/notifications/:id/read', requireAuth, async (req: AuthRequest, res) => {
  const notifId = Number(req.params.id);
  if (!Number.isInteger(notifId)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'ID không hợp lệ.' } });
  }
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, notifId), eq(notifications.userId, req.authUser!.id)));
  return res.json({ success: true });
});

// ============================================================================
// INTERNAL WALLET & QUICK SHB VIETQR TOPUP (0946265256)
// ============================================================================

router.get('/payments/bank-info', async (_req, res) => {
  try {
    const bank = await getActiveReceivingBankConfig();
    return res.json({
      success: true,
      data: {
        bankCode: bank.bankCode,
        bankName: bank.bankName,
        bankBin: bank.bankBin,
        accountNumber: bank.accountNumber,
        accountName: bank.accountName,
      },
    });
  } catch (err) {
    console.error('Bank info error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Không thể tải thông tin ngân hàng.' },
    });
  }
});

router.get('/wallet', requireAuth, async (req: AuthRequest, res) => {
  try {
    await db.insert(wallets).values({ userId: req.authUser!.id }).onConflictDoNothing();
    const [walletRow] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, req.authUser!.id))
      .limit(1);
    const bank = await getActiveReceivingBankConfig();

    return res.json({
      success: true,
      data: {
        wallet: walletRow,
        receivingBank: {
          bankCode: bank.bankCode,
          bankName: bank.bankName,
          bankBin: bank.bankBin,
          accountNumber: bank.accountNumber,
          accountName: bank.accountName,
        },
      },
    });
  } catch (err) {
    console.error('Wallet get error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Không thể tải thông tin ví.' },
    });
  }
});

router.get('/wallet/transactions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.userId, req.authUser!.id))
      .orderBy(desc(walletTransactions.createdAt))
      .limit(100);
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Wallet transactions error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Không thể tải sổ cái giao dịch.' },
    });
  }
});

router.post(
  '/payments/topups',
  requireAuth,
  rateLimit({ windowMs: 60_000, max: 12, keyPrefix: 'topup_create' }),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      amountVnd: z
        .number()
        .int('Số tiền phải là số nguyên VND')
        .min(10_000, 'Số tiền nạp tối thiểu 10.000 ₫')
        .max(100_000_000, 'Số tiền nạp tối đa 100.000.000 ₫'),
    });
    const parsed = schema.safeParse({ amountVnd: Number(req.body?.amountVnd) });
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message || 'Số tiền nạp không hợp lệ.',
        },
      });
    }

    try {
      const { order, bank } = await createQuickQrTopupOrder(
        req.authUser!.id,
        parsed.data.amountVnd
      );
      return res.status(201).json({
        success: true,
        data: {
          order,
          bank: {
            bankCode: bank.bankCode,
            bankName: bank.bankName,
            bankBin: bank.bankBin,
            accountNumber: bank.accountNumber,
            accountName: bank.accountName,
          },
        },
      });
    } catch (err) {
      console.error('Create topup error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể tạo mã nạp QR.' },
      });
    }
  }
);

router.get('/payments/topups', requireAuth, async (req: AuthRequest, res) => {
  try {
    // Auto-mark expired pending topups
    await db
      .update(topupOrders)
      .set({ status: 'EXPIRED' })
      .where(
        and(
          eq(topupOrders.userId, req.authUser!.id),
          eq(topupOrders.status, 'PENDING'),
          sql`${topupOrders.expiresAt} < NOW()`
        )
      );

    const rows = await db
      .select()
      .from(topupOrders)
      .where(eq(topupOrders.userId, req.authUser!.id))
      .orderBy(desc(topupOrders.createdAt))
      .limit(30);

    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('List topups error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Không thể tải danh sách yêu cầu nạp.' },
    });
  }
});

router.get('/payments/topups/:topupCode', requireAuth, async (req: AuthRequest, res) => {
  try {
    const topupCode = String(req.params.topupCode).toUpperCase();
    const [order] = await db
      .select()
      .from(topupOrders)
      .where(
        and(
          eq(topupOrders.topupCode, topupCode),
          eq(topupOrders.userId, req.authUser!.id)
        )
      )
      .limit(1);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Không tìm thấy yêu cầu nạp tiền.' },
      });
    }

    return res.json({ success: true, data: order });
  } catch (err) {
    console.error('Get topup detail error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Lỗi kiểm tra trạng thái nạp tiền.' },
    });
  }
});

router.post('/payments/topups/:topupCode/cancel', requireAuth, async (req: AuthRequest, res) => {
  try {
    const topupCode = String(req.params.topupCode).toUpperCase();
    const [updated] = await db
      .update(topupOrders)
      .set({ status: 'CANCELLED' })
      .where(
        and(
          eq(topupOrders.topupCode, topupCode),
          eq(topupOrders.userId, req.authUser!.id),
          eq(topupOrders.status, 'PENDING')
        )
      )
      .returning();

    if (!updated) {
      return res.status(400).json({
        success: false,
        error: { code: 'CANNOT_CANCEL', message: 'Chỉ có thể hủy yêu cầu đang chờ thanh toán.' },
      });
    }
    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('Cancel topup error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Không thể hủy yêu cầu nạp tiền.' },
    });
  }
});

router.post('/payments/webhook/:providerCode', async (req, res) => {
  try {
    const providerCode = String(req.params.providerCode || 'VIETQR_SHB').toUpperCase();
    const signatureHeader =
      (req.headers['x-webhook-signature'] as string) ||
      (req.headers['x-sis-signature'] as string) ||
      '';
    const rawStr = JSON.stringify(req.body || {});
    const signatureValid = verifyWebhookHmacSignature(rawStr, signatureHeader);

    const schema = z.object({
      externalTxId: z.string().min(3),
      transferContent: z.string().default(''),
      amountVnd: z.number().int().positive(),
      targetAccountNumber: z.string().default(''),
    });

    const parsed = schema.safeParse({
      externalTxId: req.body?.externalTxId || req.body?.id || req.body?.referenceCode,
      transferContent: req.body?.transferContent || req.body?.content || req.body?.description || '',
      amountVnd: Number(req.body?.amountVnd ?? req.body?.transferAmount ?? req.body?.amount),
      targetAccountNumber: req.body?.targetAccountNumber || req.body?.accountNumber || '',
    });

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_WEBHOOK_PAYLOAD', message: 'Payload webhook không hợp lệ.' },
      });
    }

    const result = await processBankWebhookEvent({
      providerCode,
      externalTxId: parsed.data.externalTxId,
      transferContent: parsed.data.transferContent,
      amountVnd: parsed.data.amountVnd,
      targetAccountNumber: parsed.data.targetAccountNumber,
      signatureValid,
      rawPayload: req.body,
    });

    if (result.status === 'INVALID_SIGNATURE') {
      return res.status(401).json({ success: false, error: { code: 'INVALID_SIGNATURE', message: result.message } });
    }

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('Webhook processing error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Lỗi xử lý webhook thanh toán.' },
    });
  }
});

// ============================================================================
// STAGE 2: ADMIN ACCOUNT-SPECIFIC PRICING & PAYMENT RECONCILIATION
// ============================================================================

router.get(
  '/admin/users/search',
  requireAuth,
  requireRoles('ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT'),
  async (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const usersList = await searchAccountsForPricing(q);
      return res.json({ success: true, data: usersList });
    } catch (err) {
      console.error('Admin user search error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể tìm kiếm tài khoản.' },
      });
    }
  }
);

router.get(
  '/admin/products/compact',
  requireAuth,
  requireRoles('ADMIN', 'SUPER_ADMIN'),
  async (_req, res) => {
    try {
      const rows = await db
        .select({
          id: products.id,
          code: products.code,
          title: products.title,
          listedPriceVnd: products.listedPriceVnd,
          isFree: products.isFree,
          categoryId: products.categoryId,
          categoryName: categories.name,
          categorySlug: categories.slug,
        })
        .from(products)
        .innerJoin(categories, eq(products.categoryId, categories.id))
        .where(isNull(products.deletedAt))
        .orderBy(asc(products.code));

      return res.json({ success: true, data: rows });
    } catch (err) {
      console.error('Admin compact products error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể tải danh sách bản vẽ.' },
      });
    }
  }
);

router.get(
  '/admin/pricing',
  requireAuth,
  requirePermissions('pricing:manage'),
  async (req, res) => {
    try {
      const userId = req.query.userId ? Number(req.query.userId) : undefined;
      const productId = req.query.productId ? Number(req.query.productId) : undefined;
      const rows = await listAccountCustomPrices({
        userId: userId && Number.isInteger(userId) ? userId : undefined,
        productId: productId && Number.isInteger(productId) ? productId : undefined,
        activeOnly: true,
      });
      return res.json({ success: true, data: rows });
    } catch (err) {
      console.error('Admin list pricing error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể tải bảng giá riêng.' },
      });
    }
  }
);

router.post(
  '/admin/pricing',
  requireAuth,
  requirePermissions('pricing:manage'),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      userId: z.number().int().positive(),
      productId: z.number().int().positive(),
      customPriceVnd: z.number().int().min(0, 'Giá không được âm'),
      startsAt: z.string().nullable().optional(),
      endsAt: z.string().nullable().optional(),
      note: z.string().trim().max(300).nullable().optional(),
      reason: z.string().trim().max(300).nullable().optional(),
    });

    const parsed = schema.safeParse({
      ...req.body,
      userId: Number(req.body?.userId),
      productId: Number(req.body?.productId),
      customPriceVnd: Number(req.body?.customPriceVnd),
    });

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message || 'Dữ liệu giá riêng không hợp lệ.',
        },
      });
    }

    try {
      const saved = await upsertAccountCustomPrice({
        userId: parsed.data.userId,
        productId: parsed.data.productId,
        customPriceVnd: parsed.data.customPriceVnd,
        startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : null,
        endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : null,
        note: parsed.data.note ?? null,
        reason: parsed.data.reason ?? null,
        adminUserId: req.authUser!.id,
        ipAddress: req.ip || null,
      });

      return res.status(201).json({ success: true, data: saved });
    } catch (err: any) {
      console.error('Admin upsert pricing error:', err);
      return res.status(400).json({
        success: false,
        error: { code: 'PRICING_ERROR', message: err?.message || 'Không thể lưu giá riêng.' },
      });
    }
  }
);

router.post(
  '/admin/pricing/bulk',
  requireAuth,
  requirePermissions('pricing:manage'),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      userIds: z.array(z.number().int().positive()).min(1, 'Chọn ít nhất 1 tài khoản'),
      productIds: z.array(z.number().int().positive()).optional(),
      categorySlug: z.string().optional(),
      mode: z.enum(['FIXED_VND', 'PERCENT_DISCOUNT']),
      value: z.number().int().min(0),
      startsAt: z.string().nullable().optional(),
      endsAt: z.string().nullable().optional(),
      note: z.string().trim().max(300).nullable().optional(),
      reason: z.string().trim().max(300).nullable().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message || 'Tham số cập nhật giá hàng loạt không hợp lệ.',
        },
      });
    }

    try {
      const result = await bulkApplyAccountPricing({
        userIds: parsed.data.userIds,
        productIds: parsed.data.productIds,
        categorySlug: parsed.data.categorySlug,
        mode: parsed.data.mode,
        value: parsed.data.value,
        startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : null,
        endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : null,
        note: parsed.data.note ?? null,
        reason: parsed.data.reason ?? null,
        adminUserId: req.authUser!.id,
        ipAddress: req.ip || null,
      });

      return res.json({ success: true, data: result });
    } catch (err: any) {
      console.error('Admin bulk pricing error:', err);
      return res.status(400).json({
        success: false,
        error: { code: 'BULK_PRICING_ERROR', message: err?.message || 'Không thể cập nhật hàng loạt.' },
      });
    }
  }
);

router.delete(
  '/admin/pricing/:id',
  requireAuth,
  requirePermissions('pricing:manage'),
  async (req: AuthRequest, res) => {
    const priceId = Number(req.params.id);
    if (!Number.isInteger(priceId) || priceId <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'ID giá riêng không hợp lệ.' },
      });
    }

    try {
      const result = await removeAccountCustomPrice({
        priceId,
        adminUserId: req.authUser!.id,
        reason: typeof req.body?.reason === 'string' ? req.body.reason : null,
        ipAddress: req.ip || null,
      });
      return res.json({ success: true, data: result });
    } catch (err: any) {
      console.error('Admin delete pricing error:', err);
      return res.status(400).json({
        success: false,
        error: { code: 'DELETE_PRICING_ERROR', message: err?.message || 'Không thể xóa giá riêng.' },
      });
    }
  }
);

router.get(
  '/admin/pricing/logs',
  requireAuth,
  requirePermissions('pricing:manage'),
  async (req, res) => {
    try {
      const userId = req.query.userId ? Number(req.query.userId) : undefined;
      const productId = req.query.productId ? Number(req.query.productId) : undefined;
      const logs = await listPriceChangeLogs({
        userId: userId && Number.isInteger(userId) ? userId : undefined,
        productId: productId && Number.isInteger(productId) ? productId : undefined,
      });
      return res.json({ success: true, data: logs });
    } catch (err) {
      console.error('Admin pricing logs error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể tải lịch sử thay đổi giá.' },
      });
    }
  }
);

router.get(
  '/admin/payments/topups',
  requireAuth,
  requireRoles('ADMIN', 'ACCOUNTANT', 'SUPER_ADMIN'),
  async (_req, res) => {
    try {
      const rows = await db
        .select({
          id: topupOrders.id,
          topupCode: topupOrders.topupCode,
          userId: topupOrders.userId,
          requestedAmountVnd: topupOrders.requestedAmountVnd,
          receivedAmountVnd: topupOrders.receivedAmountVnd,
          bankAccountNumber: topupOrders.bankAccountNumber,
          status: topupOrders.status,
          expiresAt: topupOrders.expiresAt,
          paidAt: topupOrders.paidAt,
          createdAt: topupOrders.createdAt,
          userFullName: users.fullName,
          userEmail: users.email,
        })
        .from(topupOrders)
        .innerJoin(users, eq(topupOrders.userId, users.id))
        .orderBy(desc(topupOrders.createdAt))
        .limit(60);

      const reconciliations = await db
        .select()
        .from(paymentReconciliations)
        .orderBy(desc(paymentReconciliations.createdAt))
        .limit(30);

      return res.json({ success: true, data: { topups: rows, reconciliations } });
    } catch (err) {
      console.error('Admin topups error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể tải danh sách nạp tiền.' },
      });
    }
  }
);

router.post(
  '/admin/payments/topups/:topupCode/confirm',
  requireAuth,
  requireRoles('ADMIN', 'ACCOUNTANT', 'SUPER_ADMIN'),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      receivedAmountVnd: z.number().int().positive(),
      bankRefCode: z.string().trim().min(3, 'Vui lòng nhập mã tham chiếu ngân hàng SHB'),
      note: z.string().trim().min(3, 'Vui lòng nhập ghi chú đối soát'),
    });

    const parsed = schema.safeParse({
      receivedAmountVnd: Number(req.body?.receivedAmountVnd),
      bankRefCode: req.body?.bankRefCode,
      note: req.body?.note,
    });

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message || 'Thông tin đối soát không hợp lệ.',
        },
      });
    }

    try {
      const result = await adminConfirmTopupReconciliation({
        adminUserId: req.authUser!.id,
        topupCode: String(req.params.topupCode).toUpperCase(),
        receivedAmountVnd: parsed.data.receivedAmountVnd,
        bankRefCode: parsed.data.bankRefCode,
        note: parsed.data.note,
        ipAddress: req.ip || null,
      });

      return res.json({ success: true, data: result });
    } catch (err: any) {
      console.error('Admin confirm topup error:', err);
      return res.status(400).json({
        success: false,
        error: { code: 'RECONCILE_ERROR', message: err?.message || 'Không thể xác nhận đối soát.' },
      });
    }
  }
);

router.patch(
  '/admin/payments/bank-config',
  requireAuth,
  requireRoles('ADMIN', 'SUPER_ADMIN'),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      bankCode: z.string().trim().min(2).max(20),
      bankName: z.string().trim().min(3).max(120),
      bankBin: z.string().trim().regex(/^[0-9]{6}$/, 'Mã BIN ngân hàng gồm 6 chữ số'),
      accountNumber: z.string().trim().min(5).max(30),
      accountName: z.string().trim().min(2).max(100),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message || 'Cấu hình ngân hàng không hợp lệ.',
        },
      });
    }

    try {
      const [updated] = await db
        .update(paymentProviders)
        .set({
          configJson: parsed.data,
          updatedAt: new Date(),
        })
        .where(eq(paymentProviders.code, 'VIETQR_SHB'))
        .returning();

      await db.insert(adminLogs).values({
        adminUserId: req.authUser!.id,
        action: 'UPDATE_BANK_CONFIG',
        targetType: 'PAYMENT_PROVIDER',
        targetId: 'VIETQR_SHB',
        detailsJson: parsed.data,
        ipAddress: req.ip || null,
      });

      return res.json({ success: true, data: updated });
    } catch (err) {
      console.error('Update bank config error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể cập nhật cấu hình ngân hàng.' },
      });
    }
  }
);

// ============================================================================
// STAGE 3: ATOMIC ORDER CHECKOUT & SECURE SIGNED URL DOWNLOADS
// ============================================================================

router.post(
  '/orders/checkout',
  requireAuth,
  rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'order_checkout' }),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      productIds: z.array(z.number().int().positive()).min(1).max(20),
      couponCode: z.string().trim().max(40).nullable().optional(),
      idempotencyKey: z.string().trim().max(100).nullable().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message || 'Danh sách bản vẽ thanh toán không hợp lệ.',
        },
      });
    }

    try {
      const result = await checkoutOrder({
        buyerId: req.authUser!.id,
        productIds: parsed.data.productIds,
        couponCode: parsed.data.couponCode ?? null,
        idempotencyKey: parsed.data.idempotencyKey ?? null,
        ipAddress: req.ip || null,
      });

      return res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      if (err instanceof CheckoutError) {
        return res.status(err.status).json({
          success: false,
          error: {
            code: err.code,
            message: err.message,
            ...(err.meta ? { details: err.meta } : {}),
          },
        });
      }
      console.error('Checkout error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể xử lý đơn hàng lúc này.' },
      });
    }
  }
);

router.post(
  '/downloads/request-url',
  requireAuth,
  rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'dl_sign' }),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      productId: z.number().int().positive(),
      fileId: z.number().int().positive().optional(),
    });

    const parsed = schema.safeParse({
      productId: Number(req.body?.productId),
      fileId: req.body?.fileId ? Number(req.body.fileId) : undefined,
    });

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Mã bản vẽ tải xuống không hợp lệ.' },
      });
    }

    try {
      const signed = await createSignedDownloadUrl({
        userId: req.authUser!.id,
        productId: parsed.data.productId,
        fileId: parsed.data.fileId,
      });

      return res.json({ success: true, data: signed });
    } catch (err: any) {
      if (err instanceof DownloadError) {
        return res.status(err.status).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      console.error('Create signed download URL error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể cấp liên kết tải xuống.' },
      });
    }
  }
);

router.get('/downloads/file', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_TOKEN', message: 'Thiếu token tải xuống hợp lệ.' },
    });
  }

  try {
    const resolved = await consumeSignedDownloadAndResolveFile({
      token,
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
    });

    res.setHeader('Content-Type', resolved.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(resolved.filename)}"; filename*=UTF-8''${encodeURIComponent(resolved.filename)}`
    );
    res.setHeader('Content-Length', String(resolved.sizeBytes));
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const stream = fs.createReadStream(resolved.filePath);
    stream.on('error', (streamErr) => {
      console.error('File stream error:', streamErr);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: { code: 'STREAM_ERROR', message: 'Không thể đọc tệp bản vẽ.' },
        });
      }
    });
    stream.pipe(res);
  } catch (err: any) {
    if (err instanceof DownloadError) {
      return res.status(err.status).json({
        success: false,
        error: { code: err.code, message: err.message },
      });
    }
    console.error('Download file error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Lỗi tải tệp bản vẽ.' },
    });
  }
});

// ============================================================================
// STAGE 4: SELLER MARKETPLACE (ONBOARDING, UPLOADS, VERSIONS, COMMISSIONS, PAYOUTS)
// ============================================================================

router.get('/seller/profile', requireAuth, async (req: AuthRequest, res) => {
  try {
    const info = await getSellerByUserId(req.authUser!.id);
    return res.json({ success: true, data: info || { seller: null, balance: null } });
  } catch (err) {
    console.error('Seller profile get error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Không thể tải thông tin Kênh Người bán.' },
    });
  }
});

router.post('/seller/profile', requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    displayName: z.string().trim().min(3, 'Tên gian hàng / Studio tối thiểu 3 ký tự').max(120),
    specialty: z.string().trim().max(150).nullable().optional(),
    bio: z.string().trim().max(600).nullable().optional(),
    bankName: z.string().trim().max(100).nullable().optional(),
    bankAccountNumber: z.string().trim().max(40).nullable().optional(),
    bankAccountHolder: z.string().trim().max(120).nullable().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message || 'Thông tin Kênh Người bán không hợp lệ.',
      },
    });
  }

  try {
    const result = await registerOrUpdateSellerProfile({
      userId: req.authUser!.id,
      displayName: parsed.data.displayName,
      specialty: parsed.data.specialty ?? null,
      bio: parsed.data.bio ?? null,
      bankName: parsed.data.bankName ?? null,
      bankAccountNumber: parsed.data.bankAccountNumber ?? null,
      bankAccountHolder: parsed.data.bankAccountHolder ?? null,
      ipAddress: req.ip || null,
    });
    return res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    console.error('Seller profile save error:', err);
    return res.status(400).json({
      success: false,
      error: { code: 'SELLER_ERROR', message: err?.message || 'Không thể lưu hồ sơ Người bán.' },
    });
  }
});

router.get('/seller/products', requireAuth, async (req: AuthRequest, res) => {
  try {
    const info = await getSellerByUserId(req.authUser!.id);
    if (!info) {
      return res.status(403).json({
        success: false,
        error: { code: 'NOT_A_SELLER', message: 'Tài khoản chưa kích hoạt Kênh Người bán.' },
      });
    }
    const items = await listSellerProducts(info.seller.id);
    return res.json({ success: true, data: items });
  } catch (err) {
    console.error('Seller products list error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Không thể tải danh sách bản vẽ đã đăng.' },
    });
  }
});

router.post(
  '/seller/products',
  requireAuth,
  requirePermissions('product:create'),
  upload.fields([
    { name: 'drawingFile', maxCount: 1 },
    { name: 'previewImage', maxCount: 1 },
  ]),
  async (req: AuthRequest, res) => {
    try {
      const info = await getSellerByUserId(req.authUser!.id);
      if (!info) {
        return res.status(403).json({
          success: false,
          error: { code: 'NOT_A_SELLER', message: 'Vui lòng kích hoạt hồ sơ Người bán trước.' },
        });
      }

      const filesMap = (req.files || {}) as Record<string, Express.Multer.File[]>;
      const drawingFile = filesMap.drawingFile?.[0];
      const previewImage = filesMap.previewImage?.[0];

      if (!drawingFile) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_FILE', message: 'Vui lòng đính kèm tệp bản vẽ kỹ thuật.' },
        });
      }

      const schema = z.object({
        title: z.string().trim().min(5, 'Tiêu đề tối thiểu 5 ký tự').max(180),
        summary: z.string().trim().min(10, 'Tóm tắt tối thiểu 10 ký tự').max(400),
        description: z.string().trim().min(20, 'Mô tả chi tiết tối thiểu 20 ký tự').max(4000),
        categoryId: z.number().int().positive('Vui lòng chọn danh mục'),
        listedPriceVnd: z.number().int().min(0),
        isFree: z.boolean(),
        fileFormat: z.string().trim().min(2).max(40),
        softwareVersion: z.string().trim().max(80).nullable().optional(),
        pageOrSheetCount: z.number().int().min(1).max(5000),
        presetThumbnailUrl: z.string().trim().nullable().optional(),
        submitMode: z.enum(['PENDING', 'DRAFT']).optional(),
      });

      const parsed = schema.safeParse({
        title: req.body?.title,
        summary: req.body?.summary,
        description: req.body?.description,
        categoryId: Number(req.body?.categoryId),
        listedPriceVnd: Number(req.body?.listedPriceVnd || 0),
        isFree: req.body?.isFree === 'true' || req.body?.isFree === true,
        fileFormat: req.body?.fileFormat,
        softwareVersion: req.body?.softwareVersion || null,
        pageOrSheetCount: Number(req.body?.pageOrSheetCount || 1),
        presetThumbnailUrl: req.body?.presetThumbnailUrl || null,
        submitMode: req.body?.submitMode === 'DRAFT' ? 'DRAFT' : 'PENDING',
      });

      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues[0]?.message || 'Thông tin hồ sơ bản vẽ không hợp lệ.',
          },
        });
      }

      const created = await createSellerProduct({
        userId: req.authUser!.id,
        sellerId: info.seller.id,
        title: parsed.data.title,
        summary: parsed.data.summary,
        description: parsed.data.description,
        categoryId: parsed.data.categoryId,
        listedPriceVnd: parsed.data.listedPriceVnd,
        isFree: parsed.data.isFree,
        fileFormat: parsed.data.fileFormat,
        softwareVersion: parsed.data.softwareVersion ?? null,
        pageOrSheetCount: parsed.data.pageOrSheetCount,
        presetThumbnailUrl: parsed.data.presetThumbnailUrl ?? null,
        previewImageFile: previewImage
          ? {
              originalname: previewImage.originalname,
              buffer: previewImage.buffer,
              mimetype: previewImage.mimetype,
            }
          : undefined,
        drawingFile: {
          originalname: drawingFile.originalname,
          buffer: drawingFile.buffer,
          mimetype: drawingFile.mimetype,
        },
        submitMode: parsed.data.submitMode,
        ipAddress: req.ip || null,
      });

      return res.status(201).json({ success: true, data: created });
    } catch (err: any) {
      if (err instanceof SellerError) {
        return res.status(err.status).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      console.error('Seller create product error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể đăng tải bản vẽ mới.' },
      });
    }
  }
);

router.patch(
  '/seller/products/:id',
  requireAuth,
  requirePermissions('product:edit_own'),
  async (req: AuthRequest, res) => {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Mã sản phẩm không hợp lệ.' },
      });
    }

    try {
      const info = await getSellerByUserId(req.authUser!.id);
      if (!info) {
        return res.status(403).json({
          success: false,
          error: { code: 'NOT_A_SELLER', message: 'Chưa kích hoạt Kênh Người bán.' },
        });
      }

      const schema = z.object({
        title: z.string().trim().min(5).max(180).optional(),
        summary: z.string().trim().min(10).max(400).optional(),
        description: z.string().trim().min(20).max(4000).optional(),
        categoryId: z.number().int().positive().optional(),
        listedPriceVnd: z.number().int().min(0).optional(),
        isFree: z.boolean().optional(),
        fileFormat: z.string().trim().min(2).max(40).optional(),
        softwareVersion: z.string().trim().max(80).nullable().optional(),
        pageOrSheetCount: z.number().int().min(1).max(5000).optional(),
        approvalStatus: z.enum(['APPROVED', 'DRAFT', 'PENDING', 'HIDDEN']).optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues[0]?.message || 'Dữ liệu cập nhật không hợp lệ.',
          },
        });
      }

      const allowDirectApprove = Boolean(
        req.authUser!.permissions.includes('product:approve') ||
          req.authUser!.roles.includes('ADMIN') ||
          req.authUser!.roles.includes('SUPER_ADMIN') ||
          req.authUser!.roles.includes('MODERATOR')
      );

      const updated = await updateSellerProduct({
        userId: req.authUser!.id,
        sellerId: info.seller.id,
        productId,
        ...parsed.data,
        allowDirectApprove,
        ipAddress: req.ip || null,
      });
      return res.json({ success: true, data: updated });
    } catch (err: any) {
      if (err instanceof SellerError) {
        return res.status(err.status).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      console.error('Seller update product error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể cập nhật bản vẽ.' },
      });
    }
  }
);

router.post(
  '/seller/products/:id/versions',
  requireAuth,
  requirePermissions('product:edit_own'),
  upload.single('drawingFile'),
  async (req: AuthRequest, res) => {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Mã bản vẽ không hợp lệ.' },
      });
    }

    try {
      const info = await getSellerByUserId(req.authUser!.id);
      if (!info) {
        return res.status(403).json({
          success: false,
          error: { code: 'NOT_A_SELLER', message: 'Chưa kích hoạt Kênh Người bán.' },
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_FILE', message: 'Vui lòng đính kèm tệp phiên bản mới.' },
        });
      }

      const schema = z.object({
        versionNumber: z.string().trim().min(2).max(20),
        changelog: z.string().trim().min(5).max(500),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues[0]?.message || 'Thông tin phiên bản không hợp lệ.',
          },
        });
      }

      const result = await publishSellerProductVersion({
        userId: req.authUser!.id,
        sellerId: info.seller.id,
        productId,
        versionNumber: parsed.data.versionNumber,
        changelog: parsed.data.changelog,
        drawingFile: {
          originalname: req.file.originalname,
          buffer: req.file.buffer,
          mimetype: req.file.mimetype,
        },
        ipAddress: req.ip || null,
      });

      return res.status(201).json({ success: true, data: result });
    } catch (err: any) {
      if (err instanceof SellerError) {
        return res.status(err.status).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      console.error('Publish version error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể phát hành phiên bản mới.' },
      });
    }
  }
);

router.get('/seller/revenue', requireAuth, async (req: AuthRequest, res) => {
  try {
    const info = await getSellerByUserId(req.authUser!.id);
    if (!info) {
      return res.status(403).json({
        success: false,
        error: { code: 'NOT_A_SELLER', message: 'Chưa kích hoạt Kênh Người bán.' },
      });
    }
    const data = await getSellerRevenueAndPayouts(info.seller.id);
    return res.json({ success: true, data });
  } catch (err) {
    console.error('Seller revenue error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Không thể tải báo cáo doanh thu.' },
    });
  }
});

router.post(
  '/seller/payouts',
  requireAuth,
  requirePermissions('seller:payout_request'),
  rateLimit({ windowMs: 60_000, max: 10, keyPrefix: 'seller_payout' }),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      amountVnd: z.number().int().min(50_000, 'Số tiền rút tối thiểu là 50.000 ₫'),
      bankName: z.string().trim().max(100).optional(),
      bankAccountNumber: z.string().trim().max(40).optional(),
      bankAccountHolder: z.string().trim().max(120).optional(),
      note: z.string().trim().max(300).nullable().optional(),
    });

    const parsed = schema.safeParse({
      ...req.body,
      amountVnd: Number(req.body?.amountVnd),
    });

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message || 'Yêu cầu rút tiền không hợp lệ.',
        },
      });
    }

    try {
      const info = await getSellerByUserId(req.authUser!.id);
      if (!info) {
        return res.status(403).json({
          success: false,
          error: { code: 'NOT_A_SELLER', message: 'Chưa kích hoạt Kênh Người bán.' },
        });
      }

      const payout = await createSellerPayoutRequest({
        userId: req.authUser!.id,
        sellerId: info.seller.id,
        amountVnd: parsed.data.amountVnd,
        bankName: parsed.data.bankName,
        bankAccountNumber: parsed.data.bankAccountNumber,
        bankAccountHolder: parsed.data.bankAccountHolder,
        note: parsed.data.note ?? null,
        ipAddress: req.ip || null,
      });

      return res.status(201).json({ success: true, data: payout });
    } catch (err: any) {
      if (err instanceof SellerError) {
        return res.status(err.status).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      console.error('Seller payout error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể tạo yêu cầu rút tiền.' },
      });
    }
  }
);

// ============================================================================
// ADMIN / MODERATOR / ACCOUNTANT: PRODUCT MODERATION & SELLER PAYOUTS
// ============================================================================

router.get(
  '/admin/products/moderation',
  requireAuth,
  requireRoles('ADMIN', 'SUPER_ADMIN', 'MODERATOR'),
  async (req, res) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : 'ALL';
      const rows = await listProductsForModeration(status);
      return res.json({ success: true, data: rows });
    } catch (err) {
      console.error('Moderation list error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể tải danh sách kiểm duyệt.' },
      });
    }
  }
);

router.post(
  '/admin/products/:id/moderate',
  requireAuth,
  requireRoles('ADMIN', 'SUPER_ADMIN', 'MODERATOR'),
  async (req: AuthRequest, res) => {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Mã bản vẽ không hợp lệ.' },
      });
    }

    const schema = z.object({
      decision: z.enum(['APPROVED', 'REJECTED']),
      rejectionReason: z.string().trim().max(400).nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Quyết định kiểm duyệt không hợp lệ.' },
      });
    }

    try {
      const updated = await moderateSellerProduct({
        moderatorUserId: req.authUser!.id,
        productId,
        decision: parsed.data.decision,
        rejectionReason: parsed.data.rejectionReason ?? null,
        ipAddress: req.ip || null,
      });
      return res.json({ success: true, data: updated });
    } catch (err: any) {
      if (err instanceof SellerError) {
        return res.status(err.status).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      console.error('Moderate product error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể duyệt bản vẽ.' },
      });
    }
  }
);

router.post(
  '/admin/commissions/settle',
  requireAuth,
  requireRoles('ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT'),
  async (req: AuthRequest, res) => {
    try {
      const sellerId = req.body?.sellerId ? Number(req.body.sellerId) : undefined;
      const result = await settlePendingSellerCommissions({
        adminUserId: req.authUser!.id,
        sellerId: sellerId && Number.isInteger(sellerId) ? sellerId : undefined,
        ipAddress: req.ip || null,
      });
      return res.json({ success: true, data: result });
    } catch (err) {
      console.error('Settle commissions error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể kết chuyển hoa hồng.' },
      });
    }
  }
);

router.get(
  '/admin/payouts',
  requireAuth,
  requireRoles('ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT'),
  async (_req, res) => {
    try {
      const rows = await listSellerPayoutsForAdmin();
      return res.json({ success: true, data: rows });
    } catch (err) {
      console.error('Admin payouts list error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể tải danh sách chi trả Người bán.' },
      });
    }
  }
);

router.post(
  '/admin/payouts/:id/process',
  requireAuth,
  requireRoles('ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT'),
  async (req: AuthRequest, res) => {
    const payoutId = Number(req.params.id);
    if (!Number.isInteger(payoutId) || payoutId <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Mã yêu cầu rút tiền không hợp lệ.' },
      });
    }

    const schema = z.object({
      action: z.enum(['PAY', 'REJECT']),
      bankRefCode: z.string().trim().max(80).optional(),
      note: z.string().trim().max(300).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Thông tin xử lý rút tiền không hợp lệ.' },
      });
    }

    try {
      const updated = await processSellerPayoutByAdmin({
        adminUserId: req.authUser!.id,
        payoutId,
        action: parsed.data.action,
        bankRefCode: parsed.data.bankRefCode,
        note: parsed.data.note,
        ipAddress: req.ip || null,
      });
      return res.json({ success: true, data: updated });
    } catch (err: any) {
      if (err instanceof SellerError) {
        return res.status(err.status).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      console.error('Process seller payout error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể xử lý yêu cầu rút tiền.' },
      });
    }
  }
);

// ============================================================================
// STAGE 5: ADMIN ANALYTICS, RBAC USERS, CMS, SUPPORT & SYSTEM AUDIT LOGS
// ============================================================================

router.get('/cms/home', async (_req, res) => {
  try {
    const data = await getPublicCmsHomeData();
    return res.json({ success: true, data });
  } catch (err) {
    console.error('CMS home error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Không thể tải cấu hình trang chủ.' },
    });
  }
});

router.get(
  '/admin/analytics',
  requireAuth,
  requireRoles('ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT'),
  async (_req, res) => {
    try {
      const report = await getAdminAnalyticsReport();
      return res.json({ success: true, data: report });
    } catch (err) {
      console.error('Admin analytics error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể tải báo cáo thống kê.' },
      });
    }
  }
);

router.get(
  '/admin/roles',
  requireAuth,
  requireRoles('ADMIN', 'SUPER_ADMIN'),
  async (_req, res) => {
    try {
      const rows = await listAllRbacRoles();
      return res.json({ success: true, data: rows });
    } catch (err) {
      console.error('List roles error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể tải danh sách vai trò RBAC.' },
      });
    }
  }
);

router.get(
  '/admin/users',
  requireAuth,
  requireRoles('ADMIN', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const status = typeof req.query.status === 'string' ? req.query.status : 'ALL';
      const role = typeof req.query.role === 'string' ? req.query.role : 'ALL';
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 50;
      const data = await listAdminUsers({ q, status, role, page, limit });
      return res.json({ success: true, data });
    } catch (err) {
      console.error('Admin users list error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể tải danh sách thành viên.' },
      });
    }
  }
);

router.post(
  '/admin/users',
  requireAuth,
  requireRoles('ADMIN', 'SUPER_ADMIN'),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      fullName: z.string().trim().min(2, 'Họ tên tối thiểu 2 ký tự').max(120),
      email: z.string().trim().email('Email không hợp lệ').toLowerCase(),
      phone: z
        .string()
        .trim()
        .regex(/^(0|\+84)[0-9]{8,10}$/, 'Số điện thoại Việt Nam không hợp lệ')
        .nullable()
        .optional(),
      password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự').max(128),
      roleCodes: z.array(z.string().min(2)).optional(),
      initialWalletVnd: z.number().int().min(0).max(2_000_000_000).optional(),
      emailVerified: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message || 'Thông tin tạo tài khoản không hợp lệ.',
        },
      });
    }

    try {
      const created = await createAdminUser({
        actorUserId: req.authUser!.id,
        actorRoles: req.authUser!.roles,
        ...parsed.data,
        ipAddress: req.ip || null,
      });
      return res.status(201).json({ success: true, data: created });
    } catch (err: any) {
      if (err instanceof AdminServiceError) {
        return res.status(err.status).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      console.error('Create admin user error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể tạo tài khoản thành viên.' },
      });
    }
  }
);

router.get(
  '/admin/users/:id/detail',
  requireAuth,
  requireRoles('ADMIN', 'SUPER_ADMIN'),
  async (req, res) => {
    const targetUserId = Number(req.params.id);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Mã thành viên không hợp lệ.' },
      });
    }

    try {
      const detail = await getAdminUserDetail(targetUserId);
      return res.json({ success: true, data: detail });
    } catch (err: any) {
      if (err instanceof AdminServiceError) {
        return res.status(err.status).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      console.error('Get admin user detail error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể tải hồ sơ chi tiết thành viên.' },
      });
    }
  }
);

router.patch(
  '/admin/users/:id',
  requireAuth,
  requireRoles('ADMIN', 'SUPER_ADMIN'),
  async (req: AuthRequest, res) => {
    const targetUserId = Number(req.params.id);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Mã thành viên không hợp lệ.' },
      });
    }

    const schema = z.object({
      roleCodes: z.array(z.string().min(2)).min(1).optional(),
      status: z.enum(['ACTIVE', 'LOCKED']).optional(),
      reason: z.string().trim().max(300).nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Dữ liệu cập nhật quyền không hợp lệ.' },
      });
    }

    try {
      const updated = await updateAdminUserRolesAndStatus({
        actorUserId: req.authUser!.id,
        actorRoles: req.authUser!.roles,
        targetUserId,
        roleCodes: parsed.data.roleCodes,
        status: parsed.data.status,
        reason: parsed.data.reason ?? null,
        ipAddress: req.ip || null,
      });
      return res.json({ success: true, data: updated });
    } catch (err: any) {
      if (err instanceof AdminServiceError) {
        return res.status(err.status).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      console.error('Update admin user error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể cập nhật phân quyền thành viên.' },
      });
    }
  }
);

router.patch(
  '/admin/users/:id/profile',
  requireAuth,
  requireRoles('ADMIN', 'SUPER_ADMIN'),
  async (req: AuthRequest, res) => {
    const targetUserId = Number(req.params.id);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Mã thành viên không hợp lệ.' },
      });
    }

    const schema = z.object({
      fullName: z.string().trim().min(2).max(120).optional(),
      phone: z
        .string()
        .trim()
        .regex(/^(0|\+84)[0-9]{8,10}$/, 'Số điện thoại Việt Nam không hợp lệ')
        .nullable()
        .optional(),
      emailVerified: z.boolean().optional(),
      companyName: z.string().trim().max(150).nullable().optional(),
      jobTitle: z.string().trim().max(100).nullable().optional(),
      address: z.string().trim().max(255).nullable().optional(),
      city: z.string().trim().max(80).nullable().optional(),
      newPassword: z.string().min(6, 'Mật khẩu mới tối thiểu 6 ký tự').max(128).optional(),
      revokeSessions: z.boolean().optional(),
      reason: z.string().trim().max(300).nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message || 'Thông tin hỗ trợ cập nhật không hợp lệ.',
        },
      });
    }

    try {
      const result = await updateAdminUserProfileAndSecurity({
        actorUserId: req.authUser!.id,
        actorRoles: req.authUser!.roles,
        targetUserId,
        ...parsed.data,
        ipAddress: req.ip || null,
      });
      return res.json({ success: true, data: result });
    } catch (err: any) {
      if (err instanceof AdminServiceError) {
        return res.status(err.status).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      console.error('Assist update user profile error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể hỗ trợ cập nhật tài khoản.' },
      });
    }
  }
);

router.post(
  '/admin/users/:id/wallet-adjust',
  requireAuth,
  requireRoles('ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT'),
  async (req: AuthRequest, res) => {
    const targetUserId = Number(req.params.id);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Mã thành viên không hợp lệ.' },
      });
    }

    const schema = z.object({
      direction: z.enum(['CREDIT', 'DEBIT']),
      amountVnd: z.number().int().min(1000, 'Số tiền tối thiểu 1.000 ₫').max(2_000_000_000),
      reason: z.string().trim().min(3, 'Vui lòng nhập lý do điều chỉnh ví').max(300),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message || 'Dữ liệu điều chỉnh ví không hợp lệ.',
        },
      });
    }

    try {
      const result = await adjustUserWalletByAdmin({
        actorUserId: req.authUser!.id,
        targetUserId,
        direction: parsed.data.direction,
        amountVnd: parsed.data.amountVnd,
        reason: parsed.data.reason,
        ipAddress: req.ip || null,
      });
      return res.json({ success: true, data: result });
    } catch (err: any) {
      if (err instanceof AdminServiceError) {
        return res.status(err.status).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      console.error('Admin wallet adjust error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể điều chỉnh ví thành viên.' },
      });
    }
  }
);

router.post(
  '/admin/users/:id/grant-entitlement',
  requireAuth,
  requireRoles('ADMIN', 'SUPER_ADMIN'),
  async (req: AuthRequest, res) => {
    const targetUserId = Number(req.params.id);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Mã thành viên không hợp lệ.' },
      });
    }

    const schema = z.object({
      productId: z.number().int().positive('Vui lòng chọn hồ sơ bản vẽ'),
      additionalDownloads: z.number().int().min(1).max(100).optional(),
      reason: z.string().trim().max(300).nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message || 'Thông tin cấp quyền tải không hợp lệ.',
        },
      });
    }

    try {
      const ent = await grantUserDrawingEntitlementByAdmin({
        actorUserId: req.authUser!.id,
        targetUserId,
        productId: parsed.data.productId,
        additionalDownloads: parsed.data.additionalDownloads,
        reason: parsed.data.reason ?? null,
        ipAddress: req.ip || null,
      });
      return res.json({ success: true, data: ent });
    } catch (err: any) {
      if (err instanceof AdminServiceError) {
        return res.status(err.status).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      console.error('Grant entitlement error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể cấp quyền tải bản vẽ.' },
      });
    }
  }
);

router.post(
  '/admin/users/:id/support-message',
  requireAuth,
  requireRoles('ADMIN', 'SUPER_ADMIN', 'MODERATOR'),
  async (req: AuthRequest, res) => {
    const targetUserId = Number(req.params.id);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Mã thành viên không hợp lệ.' },
      });
    }

    const schema = z.object({
      title: z.string().trim().min(3, 'Tiêu đề tối thiểu 3 ký tự').max(150),
      message: z.string().trim().min(5, 'Nội dung hỗ trợ tối thiểu 5 ký tự').max(1500),
      createTicketLog: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message || 'Nội dung hỗ trợ không hợp lệ.',
        },
      });
    }

    try {
      const result = await sendAdminDirectSupportToUser({
        actorUserId: req.authUser!.id,
        targetUserId,
        title: parsed.data.title,
        message: parsed.data.message,
        createTicketLog: parsed.data.createTicketLog,
        ipAddress: req.ip || null,
      });
      return res.status(201).json({ success: true, data: result });
    } catch (err: any) {
      if (err instanceof AdminServiceError) {
        return res.status(err.status).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      console.error('Send direct support message error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể gửi tin nhắn hỗ trợ.' },
      });
    }
  }
);

router.get(
  '/admin/cms/banners',
  requireAuth,
  requireRoles('ADMIN', 'SUPER_ADMIN'),
  async (_req, res) => {
    try {
      const rows = await listAdminBanners();
      return res.json({ success: true, data: rows });
    } catch (err) {
      console.error('Admin banners list error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể tải danh sách banner.' },
      });
    }
  }
);

router.post(
  '/admin/cms/banners',
  requireAuth,
  requireRoles('ADMIN', 'SUPER_ADMIN'),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      id: z.number().int().positive().optional(),
      title: z.string().trim().min(3, 'Tiêu đề tối thiểu 3 ký tự').max(150),
      subtitle: z.string().trim().max(300).nullable().optional(),
      imageUrl: z.string().trim().min(3),
      targetUrl: z.string().trim().max(255).nullable().optional(),
      position: z.string().trim().max(40).optional(),
      sortOrder: z.number().int().min(0).optional(),
      isActive: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message || 'Thông tin banner không hợp lệ.',
        },
      });
    }

    try {
      const saved = await upsertAdminBanner({
        adminUserId: req.authUser!.id,
        ...parsed.data,
        ipAddress: req.ip || null,
      });
      return res.status(parsed.data.id ? 200 : 201).json({ success: true, data: saved });
    } catch (err: any) {
      if (err instanceof AdminServiceError) {
        return res.status(err.status).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      console.error('Admin save banner error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể lưu banner.' },
      });
    }
  }
);

router.delete(
  '/admin/cms/banners/:id',
  requireAuth,
  requireRoles('ADMIN', 'SUPER_ADMIN'),
  async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Mã banner không hợp lệ.' },
      });
    }
    try {
      const result = await deleteAdminBanner({
        adminUserId: req.authUser!.id,
        id,
        ipAddress: req.ip || null,
      });
      return res.json({ success: true, data: result });
    } catch (err: any) {
      if (err instanceof AdminServiceError) {
        return res.status(err.status).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      console.error('Delete banner error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể xóa banner.' },
      });
    }
  }
);

router.get(
  '/admin/cms/categories',
  requireAuth,
  requireRoles('ADMIN', 'SUPER_ADMIN'),
  async (_req, res) => {
    try {
      const rows = await listAdminCategories();
      return res.json({ success: true, data: rows });
    } catch (err) {
      console.error('Admin categories error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể tải danh mục.' },
      });
    }
  }
);

router.patch(
  '/admin/cms/categories/:id',
  requireAuth,
  requireRoles('ADMIN', 'SUPER_ADMIN'),
  async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Mã danh mục không hợp lệ.' },
      });
    }
    const schema = z.object({
      name: z.string().trim().min(2).max(80).optional(),
      description: z.string().trim().max(300).nullable().optional(),
      sortOrder: z.number().int().min(0).optional(),
      isActive: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Dữ liệu danh mục không hợp lệ.' },
      });
    }

    try {
      const updated = await updateAdminCategory({
        adminUserId: req.authUser!.id,
        id,
        ...parsed.data,
        ipAddress: req.ip || null,
      });
      return res.json({ success: true, data: updated });
    } catch (err: any) {
      if (err instanceof AdminServiceError) {
        return res.status(err.status).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      console.error('Update category error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể cập nhật danh mục.' },
      });
    }
  }
);

router.get(
  '/admin/cms/settings',
  requireAuth,
  requireRoles('ADMIN', 'SUPER_ADMIN'),
  async (_req, res) => {
    try {
      const rows = await listAdminSiteSettings();
      return res.json({ success: true, data: rows });
    } catch (err) {
      console.error('Get settings error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể tải cấu hình hệ thống.' },
      });
    }
  }
);

router.patch(
  '/admin/cms/settings',
  requireAuth,
  requireRoles('ADMIN', 'SUPER_ADMIN'),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      items: z
        .array(
          z.object({
            key: z.string().trim().min(2).max(80),
            value: z.string().trim().max(500),
            groupName: z.string().trim().max(40).optional(),
            description: z.string().trim().max(200).optional(),
          })
        )
        .min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Tham số cấu hình không hợp lệ.' },
      });
    }

    try {
      const updated = await upsertSiteSettingsBatch({
        adminUserId: req.authUser!.id,
        items: parsed.data.items,
        ipAddress: req.ip || null,
      });
      return res.json({ success: true, data: updated });
    } catch (err) {
      console.error('Update settings error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể cập nhật cấu hình.' },
      });
    }
  }
);

router.get(
  '/admin/support/tickets',
  requireAuth,
  requireRoles('ADMIN', 'SUPER_ADMIN', 'MODERATOR'),
  async (req, res) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : 'ALL';
      const rows = await listAdminSupportTickets(status);
      return res.json({ success: true, data: rows });
    } catch (err) {
      console.error('Admin tickets error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể tải danh sách phiếu hỗ trợ.' },
      });
    }
  }
);

router.patch(
  '/admin/support/tickets/:id',
  requireAuth,
  requireRoles('ADMIN', 'SUPER_ADMIN', 'MODERATOR'),
  async (req: AuthRequest, res) => {
    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Mã phiếu hỗ trợ không hợp lệ.' },
      });
    }

    const schema = z.object({
      status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']),
      replyMessage: z.string().trim().max(1000).nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Dữ liệu xử lý hỗ trợ không hợp lệ.' },
      });
    }

    try {
      const updated = await updateAdminSupportTicket({
        adminUserId: req.authUser!.id,
        ticketId,
        status: parsed.data.status,
        replyMessage: parsed.data.replyMessage ?? null,
        ipAddress: req.ip || null,
      });
      return res.json({ success: true, data: updated });
    } catch (err: any) {
      if (err instanceof AdminServiceError) {
        return res.status(err.status).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      console.error('Update ticket error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể cập nhật phiếu hỗ trợ.' },
      });
    }
  }
);

router.get(
  '/admin/audit-logs',
  requireAuth,
  requireRoles('ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT'),
  async (_req, res) => {
    try {
      const data = await listAdminAndAuditLogs();
      return res.json({ success: true, data });
    } catch (err) {
      console.error('Admin audit logs error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Không thể tải nhật ký kiểm toán.' },
      });
    }
  }
);

export default router;
