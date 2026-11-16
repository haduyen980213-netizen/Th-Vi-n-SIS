import crypto from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import { db } from '../../db/index.ts';
import {
  permissions,
  rolePermissions,
  roles,
  userProfiles,
  userRoles,
  userSessions,
  users,
  wallets,
} from '../../db/schema.ts';
import { verifyFirebaseIdToken } from '../../lib/firebase-admin.ts';

export const SESSION_COOKIE_NAME = 'sis_session';

function getSessionSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.SQL_PASSWORD ||
    'sis-dev-ephemeral-signing-key-change-in-production'
  );
}

export function hashToken(rawToken: string): string {
  return crypto.createHmac('sha256', getSessionSecret()).update(rawToken).digest('hex');
}

export function generateOpaqueToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export interface AuthenticatedUser {
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

export interface AuthRequest extends Request {
  authUser?: AuthenticatedUser;
  authProvider?: 'FIREBASE_GOOGLE' | 'LOCAL';
}

async function loadUserWithRbac(userId: number): Promise<AuthenticatedUser | null> {
  const [userRow] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);

  if (!userRow || userRow.status === 'LOCKED') {
    return null;
  }

  await ensureInitialSuperAdmin(userRow.id, userRow.email);

  const userRoleRows = await db
    .select({
      roleId: roles.id,
      roleCode: roles.code,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userRow.id));

  const roleCodes = Array.from(new Set(userRoleRows.map((r) => r.roleCode)));
  if (roleCodes.length === 0) {
    roleCodes.push('MEMBER');
  }

  const permRows = await db
    .select({
      permCode: permissions.code,
    })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(userRoles.userId, userRow.id));

  const permCodes = Array.from(new Set(permRows.map((p) => p.permCode)));

  return {
    id: userRow.id,
    uid: userRow.uid,
    email: userRow.email,
    phone: userRow.phone,
    fullName: userRow.fullName,
    avatarUrl: userRow.avatarUrl,
    emailVerified: userRow.emailVerified,
    status: userRow.status,
    roles: roleCodes,
    permissions: permCodes,
  };
}

export async function syncFirebaseUser(params: {
  uid: string;
  email: string;
  fullName?: string;
  avatarUrl?: string;
  emailVerified?: boolean;
}): Promise<AuthenticatedUser> {
  const cleanEmail = params.email.trim().toLowerCase();
  const displayName = params.fullName?.trim() || cleanEmail.split('@')[0];

  // Upsert user safely on uid or email conflict
  const existingByUid = await db
    .select()
    .from(users)
    .where(eq(users.uid, params.uid))
    .limit(1);

  let userId: number;

  if (existingByUid.length > 0) {
    const [updated] = await db
      .update(users)
      .set({
        email: cleanEmail,
        fullName: existingByUid[0].fullName || displayName,
        avatarUrl: existingByUid[0].avatarUrl || params.avatarUrl || null,
        emailVerified: Boolean(params.emailVerified || existingByUid[0].emailVerified),
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, existingByUid[0].id))
      .returning();
    userId = updated.id;
  } else {
    const existingByEmail = await db
      .select()
      .from(users)
      .where(eq(users.email, cleanEmail))
      .limit(1);

    if (existingByEmail.length > 0) {
      const [updated] = await db
        .update(users)
        .set({
          uid: params.uid,
          avatarUrl: existingByEmail[0].avatarUrl || params.avatarUrl || null,
          emailVerified: Boolean(params.emailVerified || existingByEmail[0].emailVerified),
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingByEmail[0].id))
        .returning();
      userId = updated.id;
    } else {
      const [inserted] = await db
        .insert(users)
        .values({
          uid: params.uid,
          email: cleanEmail,
          fullName: displayName,
          avatarUrl: params.avatarUrl || null,
          emailVerified: Boolean(params.emailVerified),
          status: 'ACTIVE',
          lastLoginAt: new Date(),
        })
        .onConflictDoUpdate({
          target: users.uid,
          set: {
            email: cleanEmail,
            lastLoginAt: new Date(),
            updatedAt: new Date(),
          },
        })
        .returning();
      userId = inserted.id;
    }
  }

  await db.insert(userProfiles).values({ userId }).onConflictDoNothing();
  await db.insert(wallets).values({ userId }).onConflictDoNothing();

  const [memberRole] = await db
    .select()
    .from(roles)
    .where(eq(roles.code, 'MEMBER'))
    .limit(1);

  if (memberRole) {
    await db
      .insert(userRoles)
      .values({ userId, roleId: memberRole.id })
      .onConflictDoNothing();
  }

  await ensureInitialSuperAdmin(userId, cleanEmail);

  const loaded = await loadUserWithRbac(userId);
  if (!loaded) {
    throw new Error('Tài khoản đang bị khóa hoặc không khả dụng.');
  }
  return loaded;
}

export async function ensureInitialSuperAdmin(userId: number, email: string): Promise<boolean> {
  const allowedOwnerEmail = (
    process.env.ADMIN_BOOTSTRAP_EMAIL || 'haduyen980213@gmail.com'
  )
    .trim()
    .toLowerCase();

  if (email.trim().toLowerCase() !== allowedOwnerEmail) {
    return false;
  }

  const [superAdminRole] = await db
    .select()
    .from(roles)
    .where(eq(roles.code, 'SUPER_ADMIN'))
    .limit(1);

  if (!superAdminRole) return false;

  const existingAdmins = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(eq(userRoles.roleId, superAdminRole.id))
    .limit(1);

  if (existingAdmins.length > 0) return false;

  await db
    .insert(userRoles)
    .values({ userId, roleId: superAdminRole.id })
    .onConflictDoNothing();

  const [adminRole] = await db
    .select()
    .from(roles)
    .where(eq(roles.code, 'ADMIN'))
    .limit(1);

  if (adminRole) {
    await db
      .insert(userRoles)
      .values({ userId, roleId: adminRole.id })
      .onConflictDoNothing();
  }

  return true;
}

async function loadLocalSessionUser(rawToken: string): Promise<AuthenticatedUser | null> {
  const tokenHash = hashToken(rawToken);
  const [session] = await db
    .select()
    .from(userSessions)
    .where(
      and(
        eq(userSessions.sessionTokenHash, tokenHash),
        isNull(userSessions.revokedAt),
        gt(userSessions.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!session) return null;
  return loadUserWithRbac(session.userId);
}

async function resolveAuthFromRequest(req: AuthRequest): Promise<void> {
  // 1. Check Bearer token (either 64-hex local sessionToken or Firebase ID token)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token) {
      if (token.length === 64 && /^[0-9a-f]{64}$/i.test(token)) {
        const user = await loadLocalSessionUser(token);
        if (user) {
          req.authUser = user;
          req.authProvider = 'LOCAL';
          return;
        }
      } else {
        const decoded = await verifyFirebaseIdToken(token);
        if (decoded && decoded.uid && decoded.email) {
          const user = await syncFirebaseUser({
            uid: decoded.uid,
            email: decoded.email,
            fullName: typeof decoded.name === 'string' ? decoded.name : undefined,
            avatarUrl: typeof decoded.picture === 'string' ? decoded.picture : undefined,
            emailVerified: Boolean(decoded.email_verified),
          });
          req.authUser = user;
          req.authProvider = 'FIREBASE_GOOGLE';
          return;
        }
      }
    }
  }

  // 2. Check HTTP-Only Session Cookie
  const rawCookie = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof rawCookie === 'string' && rawCookie.length >= 32) {
    const user = await loadLocalSessionUser(rawCookie);
    if (user) {
      req.authUser = user;
      req.authProvider = 'LOCAL';
    }
  }
}

export async function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  try {
    await resolveAuthFromRequest(req);
  } catch {
    // Optional auth degrades gracefully to Guest
  }
  next();
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await resolveAuthFromRequest(req);
    if (!req.authUser) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Vui lòng đăng nhập để tiếp tục.',
        },
      });
    }
    return next();
  } catch (err) {
    console.error('Authentication error:', err);
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
      },
    });
  }
}
