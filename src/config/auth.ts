import { auth } from 'express-oauth2-jwt-bearer';
import type { Request, Response, NextFunction } from 'express';
import { env } from './env.js';

const audience = env.NEXT_PUBLIC_AUTH0_AUDIENCE;
const issuerBaseURL = env.NEXT_PUBLIC_AUTH0_ISSUER_BASE_URL;

// These are optional in the env schema so DB-only crons/scripts can boot without
// them; the web service genuinely needs them, so fail fast with a clear message.
if (!audience || !issuerBaseURL) {
  throw new Error(
    'Auth0 config missing: set NEXT_PUBLIC_AUTH0_AUDIENCE and NEXT_PUBLIC_AUTH0_ISSUER_BASE_URL',
  );
}

export const checkJwt = auth({
  audience,
  issuerBaseURL,
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
