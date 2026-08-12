import { describe, test, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { flagWriteAuth, FLAG_ADMIN_PERMISSION } from './write-auth.js';
import { CANONICAL_FLAGS } from './seed.js';

const ADMIN_FLAG = CANONICAL_FLAGS.find((f) => f.access === 'admin')?.key as string;
const OPEN_FLAG = CANONICAL_FLAGS.find((f) => f.access === 'open')?.key as string;

/** Stands in for checkJwt: authenticates, with whatever permissions we pass. */
const jwtAs = (permissions: string[]) => (req: any, _res: any, next: any) => {
  req.auth = { payload: { sub: 'auth0|someone', permissions } };
  next();
};

function makeApp(permissions: string[]) {
  const app = express();
  app.patch(
    '/:flagKey',
    flagWriteAuth(undefined, jwtAs(permissions)),
    (_req, res) => res.status(200).json({ ok: true }),
  );
  return app;
}

describe('flag write tiers', () => {
  test('an admin-tier flag needs the admin permission, not just a session', async () => {
    const res = await request(makeApp([])).patch(`/${ADMIN_FLAG}`).send({ enabled: false });

    expect(res.status).toBe(403);
  });

  test('an admin-tier flag is writable with the permission', async () => {
    const res = await request(makeApp([FLAG_ADMIN_PERMISSION]))
      .patch(`/${ADMIN_FLAG}`)
      .send({ enabled: false });

    expect(res.status).toBe(200);
  });

  test('an unclassified flag key is treated as admin, not as open', async () => {
    const res = await request(makeApp([])).patch('/some-upstream-flag').send({ enabled: false });

    expect(res.status).toBe(403);
  });

  test('a signed-in user can still write the open tier without the permission', async () => {
    const res = await request(makeApp([])).patch(`/${OPEN_FLAG}`).send({ enabled: false });

    expect(res.status).toBe(200);
  });
});
