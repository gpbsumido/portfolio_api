import { describe, test, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { asyncHandler } from './asyncHandler.js';
import { errorHandler } from './errorHandler.js';
import { ValidationError } from '../shared/errors/AppError.js';

/** Throws before any try block, the shape the gallery controller had. */
async function throwsEarly() {
  throw new ValidationError('text is required');
}

describe('asyncHandler', () => {
  test('a handler that rejects still gets a response', async () => {
    const app = express();
    app.get('/wrapped', asyncHandler(throwsEarly));
    app.use(errorHandler);

    const res = await request(app).get('/wrapped');

    expect(res.status).toBe(400);
  });

  test('the rejection reaches the error handler rather than being swallowed', async () => {
    const seen: unknown[] = [];
    const app = express();
    app.get('/wrapped', asyncHandler(throwsEarly));
    app.use(((err: Error, req: never, res: never, next: never) => {
      seen.push(err);
      return errorHandler(err, req, res, next);
    }) as express.ErrorRequestHandler);

    await request(app).get('/wrapped');

    expect(seen).toHaveLength(1);
    expect((seen[0] as Error).message).toBe('text is required');
  });
});
