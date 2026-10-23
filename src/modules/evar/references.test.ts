import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const ADMIN_EMAIL = 'admin@example.com';
let claims: Record<string, unknown> | null = null;

vi.mock('../../config/auth.js', async () => {
  const { UnauthorizedError } = await import('../../shared/errors/index.js');
  return {
    checkJwt: (req: any, _res: any, next: any) => {
      if (!claims) {
        next(new UnauthorizedError());
        return;
      }
      req.auth = { payload: claims };
      next();
    },
    optionalCheckJwt: (_req: any, _res: any, next: any) => next(),
  };
});

vi.mock('./repository.js', () => ({
  getParticipant: vi.fn(),
  listReferences: vi.fn(),
  upsertReference: vi.fn(),
  deleteReference: vi.fn(),
}));

import { errorHandler } from '../../middleware/errorHandler.js';
import * as repo from './repository.js';
import evarRouter from './routes.js';

const referenceRow = {
  case_id: 'hostile-neck',
  neck_diameter: 30.5,
  neck_length: 10,
  max_sac: 70,
  right_cia: 24,
  left_cia: 12,
  note: 'Remeasured on the soft-tissue window',
  updated_by: ADMIN_EMAIL,
  updated_at: '2026-10-22T10:00:00.000Z',
};

const values = { neckDiameter: 30.5, neckLength: 10, maxSac: 70, rightCia: 24, leftCia: 12, note: 'Remeasured on the soft-tissue window' };

const asAdmin = () => {
  claims = {
    sub: 'auth0|admin',
    'https://paulsumido.com/email': ADMIN_EMAIL,
    'https://paulsumido.com/email_verified': true,
  };
};

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/evar', evarRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  claims = null;
  process.env.ADMIN_ALLOWED_EMAILS = ADMIN_EMAIL;
});

describe('reading references', () => {
  test('is public, because anonymous practice scores against them too', async () => {
    vi.mocked(repo.listReferences).mockResolvedValue([referenceRow] as never);
    const res = await request(makeApp()).get('/api/evar/references');
    expect(res.status).toBe(200);
    expect(res.body.references).toEqual([
      {
        caseId: 'hostile-neck',
        neckDiameter: 30.5,
        neckLength: 10,
        maxSac: 70,
        rightCia: 24,
        leftCia: 12,
        note: 'Remeasured on the soft-tissue window',
        updatedAt: '2026-10-22T10:00:00.000Z',
      },
    ]);
  });

  test('doesn\'t say who edited them', async () => {
    vi.mocked(repo.listReferences).mockResolvedValue([referenceRow] as never);
    const res = await request(makeApp()).get('/api/evar/references');
    expect(JSON.stringify(res.body)).not.toContain('@');
  });

  test('still needs sign-in for everything else', async () => {
    const res = await request(makeApp()).get('/api/evar/participant');
    expect(res.status).toBe(401);
  });
});

describe('editing references', () => {
  test('is admin only', async () => {
    claims = { sub: 'auth0|trainee' };
    const res = await request(makeApp()).put('/api/evar/admin/references/hostile-neck').send(values);
    expect(res.status).toBe(403);
    expect(repo.upsertReference).not.toHaveBeenCalled();
  });

  test('adds or replaces a case\'s values and records who did it', async () => {
    asAdmin();
    vi.mocked(repo.upsertReference).mockResolvedValue(referenceRow as never);
    const res = await request(makeApp()).put('/api/evar/admin/references/hostile-neck').send(values);
    expect(res.status).toBe(200);
    expect(res.body.reference).toMatchObject({ caseId: 'hostile-neck', neckDiameter: 30.5 });
    expect(repo.upsertReference).toHaveBeenCalledWith('hostile-neck', expect.objectContaining({ neckDiameter: 30.5 }), ADMIN_EMAIL);
  });

  test('needs all five values, each a plausible size', async () => {
    asAdmin();
    const missing = await request(makeApp())
      .put('/api/evar/admin/references/hostile-neck')
      .send({ ...values, leftCia: undefined });
    expect(missing.status).toBe(400);
    const negative = await request(makeApp())
      .put('/api/evar/admin/references/hostile-neck')
      .send({ ...values, maxSac: -4 });
    expect(negative.status).toBe(400);
    expect(repo.upsertReference).not.toHaveBeenCalled();
  });

  test('rejects a case id that isn\'t a slug', async () => {
    asAdmin();
    const res = await request(makeApp()).put('/api/evar/admin/references/Hostile%20Neck').send(values);
    expect(res.status).toBe(400);
  });

  test('removing an override goes back to the built-in answer', async () => {
    asAdmin();
    vi.mocked(repo.deleteReference).mockResolvedValue(true);
    const res = await request(makeApp()).delete('/api/evar/admin/references/hostile-neck');
    expect(res.status).toBe(204);
    expect(repo.deleteReference).toHaveBeenCalledWith('hostile-neck');
  });
});
