import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { EMAIL_CLAIM_NS } from '../../shared/auth/adminEmail.js';

const { clearCache } = vi.hoisted(() => ({ clearCache: vi.fn() }));

// checkJwt stands in for Auth0: the caller is signed in as whoever the
// x-test-email header says, with a verified address.
vi.mock('../../config/auth.js', () => ({
  checkJwt: (req: any, _res: any, next: any) => {
    req.auth = {
      payload: {
        sub: 'auth0|caller',
        [`${EMAIL_CLAIM_NS}email`]: req.get('x-test-email'),
        [`${EMAIL_CLAIM_NS}email_verified`]: true,
      },
    };
    next();
  },
}));
vi.mock('./service.js', () => ({
  F1Service: class {
    clearCache = clearCache;
  },
  MEMORY_ERROR_MESSAGES: {},
  requestQueue: { getStatus: () => ({ pending: 0, running: 0 }) },
}));

import { errorHandler } from '../../middleware/errorHandler.js';
import f1Routes from './routes.js';

const originalAdmins = process.env.ADMIN_ALLOWED_EMAILS;

function makeApp() {
  const app = express();
  app.use('/api/f1', f1Routes);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  clearCache.mockReset().mockResolvedValue(undefined);
  process.env.ADMIN_ALLOWED_EMAILS = 'owner@example.com';
});

afterEach(() => {
  if (originalAdmins === undefined) delete process.env.ADMIN_ALLOWED_EMAILS;
  else process.env.ADMIN_ALLOWED_EMAILS = originalAdmins;
});

describe('DELETE /api/f1/cache', () => {
  test('a signed-in user who is not the admin gets a 403 and the cache stays', async () => {
    const res = await request(makeApp()).delete('/api/f1/cache').set('x-test-email', 'someone@example.com');

    expect(res.status).toBe(403);
    expect(clearCache).not.toHaveBeenCalled();
  });

  test('the admin can clear it', async () => {
    const res = await request(makeApp()).delete('/api/f1/cache').set('x-test-email', 'owner@example.com');

    expect(res.status).toBe(200);
    expect(clearCache).toHaveBeenCalledTimes(1);
  });
});
