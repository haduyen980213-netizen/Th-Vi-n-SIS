import type { NextFunction, Response } from 'express';
import type { AuthRequest } from './auth.ts';

export function requireRoles(...allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const user = req.authUser;
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Yêu cầu đăng nhập.',
        },
      });
    }

    const hasRole =
      user.roles.includes('SUPER_ADMIN') ||
      allowedRoles.some((role) => user.roles.includes(role));

    if (!hasRole) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Bạn không có quyền truy cập chức năng này.',
        },
      });
    }

    return next();
  };
}

export function requirePermissions(...requiredPerms: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const user = req.authUser;
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Yêu cầu đăng nhập.',
        },
      });
    }

    const hasAll =
      user.roles.includes('SUPER_ADMIN') ||
      requiredPerms.every((perm) => user.permissions.includes(perm));

    if (!hasAll) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Tài khoản thiếu quyền thực thi thao tác này.',
        },
      });
    }

    return next();
  };
}
