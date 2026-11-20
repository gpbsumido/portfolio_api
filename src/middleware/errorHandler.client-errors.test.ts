import { describe, test, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorHandler } from './errorHandler.js';

/**
 * Mistakes the caller made used to come back as 500s and get logged as
 * "unhandled error": the error handler only knew AppError, Zod, multer and 401s.
 * These go through a real express app so body-parser throws what it really throws.
 */
function appThrowing(err?: Error & { code?: string }) {
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.post('/echo', (req, res) => res.json(req.body));
  app.get('/throws', (_req, _res, next) => next(err));
  app.use(errorHandler);
  return app;
}

function postgresError(code: string): Error & { code: string } {
  return Object.assign(new Error(`postgres said ${code}`), { code });
}

describe('errorHandler and client mistakes', () => {
  test('malformed JSON is a 400, not a 500', async () => {
    const res = await request(appThrowing())
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{"title": ');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BadRequest');
  });

  test('a body over the limit is a 413', async () => {
    const res = await request(appThrowing())
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ blob: 'x'.repeat(120_000) }));

    expect(res.status).toBe(413);
    expect(res.body.code).toBe('PayloadTooLarge');
  });

  test("an id Postgres can't parse (22P02) is a 400", async () => {
    const res = await request(appThrowing(postgresError('22P02'))).get('/throws');

    expect(res.status).toBe(400);
  });

  test('a reference to a row that does not exist (23503) is a 400', async () => {
    const res = await request(appThrowing(postgresError('23503'))).get('/throws');

    expect(res.status).toBe(400);
  });

  test('a duplicate (23505) is a 409', async () => {
    const res = await request(appThrowing(postgresError('23505'))).get('/throws');

    expect(res.status).toBe(409);
  });

  test('a duplicate that Drizzle wrapped in DrizzleQueryError is still a 409', async () => {
    const wrapped = Object.assign(new Error('Failed query: insert into ...\nparams: ...'), {
      cause: postgresError('23505'),
    });

    const res = await request(appThrowing(wrapped)).get('/throws');

    expect(res.status).toBe(409);
  });

  test('the Postgres message never reaches the client', async () => {
    const res = await request(appThrowing(postgresError('23505'))).get('/throws');

    expect(JSON.stringify(res.body)).not.toContain('postgres said');
  });
});
