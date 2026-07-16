import { auth } from 'express-oauth2-jwt-bearer';
import type { Request, Response, NextFunction } from 'express';
import { env } from './env.js';

export const checkJwt = auth({
  audience: env.NEXT_PUBLIC_AUTH0_AUDIENCE,
  issuerBaseURL: env.NEXT_PUBLIC_AUTH0_ISSUER_BASE_URL,
  tokenSigningAlg: 'RS256',
});

export const checkPermissions = (requiredPermissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const permissions =
      (req.auth?.payload as Record<string, unknown>)?.permissions;
    const perms = Array.isArray(permissions) ? (permissions as string[]) : [];

    const hasPermissions = requiredPermissions.every((p) => perms.includes(p));

    if (!hasPermissions) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions',
      });
      return;
    }

    next();
  };
};

export const optionalCheckJwt = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  checkJwt(req, res, () => {
    // Ignore auth errors — continue without req.auth
    next();
  });
};
