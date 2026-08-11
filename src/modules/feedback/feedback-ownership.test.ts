import { describe, test, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../config/auth.js', () => ({
  checkJwt: (req: any, _res: any, next: any) => {
    req.auth = { payload: { sub: 'auth0|attacker' } };
    next();
  },
  optionalCheckJwt: (req: any, _res: any, next: any) => {
    req.auth = { payload: { sub: 'auth0|attacker' } };
    next();
  },
}));

import feedbackRouter from './routes.js';
import { FeedbackRepository } from './repository.js';
import { errorHandler } from '../../middleware/errorHandler.js';
import { pool } from '../../config/database.js';

const VICTIM_ROW_ID = '11111111-1111-1111-1111-111111111111';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/feedback', feedbackRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  // restore, not just clear: the route tests spy on the repository prototype,
  // and a cleared-but-live spy would stop the SQL test reaching the real query.
  vi.restoreAllMocks();
  vi.mocked(pool.query).mockReset();
});

describe('feedback delete ownership', () => {
  test('the delete is scoped to the caller, not just the row id', async () => {
    const spy = vi.spyOn(FeedbackRepository.prototype, 'delete').mockResolvedValue(null);

    await request(makeApp()).delete(`/api/feedback/${VICTIM_ROW_ID}`);

    expect(spy).toHaveBeenCalledWith(VICTIM_ROW_ID, 'auth0|attacker');
  });

  test('deleting a row the caller does not own returns 404, not 200', async () => {
    vi.spyOn(FeedbackRepository.prototype, 'delete').mockResolvedValue(null);

    const res = await request(makeApp()).delete(`/api/feedback/${VICTIM_ROW_ID}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBeUndefined();
  });

  test('the SQL constrains on user_sub so a foreign id cannot match', async () => {
    const query = vi.mocked(pool.query);
    query.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await new FeedbackRepository().delete(VICTIM_ROW_ID, 'auth0|attacker');

    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/user_sub\s*=\s*\$2/);
    expect(params).toEqual([VICTIM_ROW_ID, 'auth0|attacker']);
  });
});
