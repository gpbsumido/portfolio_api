import express from 'express';
import request from 'supertest';
import { describe, expect, test, vi } from 'vitest';

vi.mock('../../config/auth.js', () => ({
  checkJwt: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.auth = { payload: { sub: 'auth0|resident' }, header: {}, token: 't' };
    next();
  },
}));

import { errorHandler } from '../../middleware/errorHandler.js';
import medJournalRoutes from './routes.js';

describe('GET /api/med-journal/', () => {
  test("answers with the signed-in caller's id", async () => {
    const app = express();
    app.use('/api/med-journal', medJournalRoutes);
    app.use(errorHandler);

    const res = await request(app).get('/api/med-journal/');

    // It read `auth.sub`, which the JWT middleware never sets, so userId was
    // always missing. The `as any` cast is what let that compile.
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('auth0|resident');
  });
});
