import { describe, expect, test, vi } from 'vitest';

// Importing the router pulls in auth, admin, and the repository; stub them so the
// module loads without a real JWT verifier or DB.
vi.mock('../../config/auth.js', () => ({
  checkJwt: (_req: any, _res: any, next: any) => next(),
  optionalCheckJwt: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../shared/auth/adminEmail.js', () => ({
  requireAdmin: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('./repository.js', () => ({}));

import zeroproofRouter from './routes.js';

/** The handler names wired for a given method+path on the router. */
function handlersFor(method: string, path: string): string[] {
  const layer = (zeroproofRouter as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`no ${method.toUpperCase()} ${path} route`);
  return layer.route.stack.map((s: any) => s.handle.name);
}

describe('zeroproof routes capture the caller into the users table', () => {
  // Every signed-in bettor hits at least one of these, so upsertUser on them is
  // what fills users.email — without it the god's view has only a handle to show.
  const authedRoutes: Array<[string, string]> = [
    ['post', '/bets'],
    ['get', '/bets'],
    ['post', '/wallets'],
    ['get', '/wallets'],
    ['get', '/me'],
  ];

  test.each(authedRoutes)('%s %s runs upsertUser', (method, path) => {
    expect(handlersFor(method, path)).toContain('upsertUser');
  });
});
