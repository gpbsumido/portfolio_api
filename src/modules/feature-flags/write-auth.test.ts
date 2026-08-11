import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import request from 'supertest';
import { describe, test } from 'vitest';

import { FLAGS_TOKEN_HEADER, flagWriteAuth } from './write-auth.js';

/** Stands in for checkJwt: authorized when an Authorization header is present. */
const fakeJwt = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.headers.authorization) {
    res.status(401).json({ error: 'jwt required' });
    return;
  }
  next();
};

function app(secret: string | undefined) {
  const a = express();
  a.use(express.json());
  a.patch('/:flagKey', flagWriteAuth(secret, fakeJwt), (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return a;
}

describe('flagWriteAuth', () => {
  test('lets the service token through for an open flag', async () => {
    // The console's loosest rung has no user to borrow a token from, so the
    // BFF vouches for the visitor instead.
    await request(app('s3cret')).patch('/dark-mode').set(FLAGS_TOKEN_HEADER, 's3cret').expect(200);
  });

  test('rejects a wrong service token on an open flag', async () => {
    await request(app('s3cret')).patch('/dark-mode').set(FLAGS_TOKEN_HEADER, 'nope').expect(401);
  });

  test('still accepts a signed-in user on an open flag', async () => {
    await request(app('s3cret'))
      .patch('/dark-mode')
      .set('authorization', 'Bearer user')
      .expect(200);
  });

  test('refuses the service token on a signed-in-tier flag', async () => {
    // Above the open rung the write must carry a real identity. Honouring the
    // service token here would let the BFF write anything on anyone's behalf.
    await request(app('s3cret'))
      .patch('/new-checkout')
      .set(FLAGS_TOKEN_HEADER, 's3cret')
      .expect(401);
  });

  test('refuses the service token on an admin flag', async () => {
    await request(app('s3cret')).patch('/pocket-tcg').set(FLAGS_TOKEN_HEADER, 's3cret').expect(401);
  });

  test('requires a jwt for a flag it has never heard of', async () => {
    // Unknown keys fail closed: a new flag must not be writable by the service
    // token just because nobody has classified it yet.
    await request(app('s3cret')).patch('/brand-new').set(FLAGS_TOKEN_HEADER, 's3cret').expect(401);
  });

  test('falls back to jwt-only when no secret is configured', async () => {
    // A fresh clone and local dev have no secret. Treating "unset" as "open to
    // anyone" would be a silent hole.
    await request(app(undefined)).patch('/dark-mode').expect(401);
    await request(app(undefined)).patch('/dark-mode').set('authorization', 'Bearer u').expect(200);
  });
});
