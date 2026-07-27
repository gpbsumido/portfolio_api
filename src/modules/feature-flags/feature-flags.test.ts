import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Mock the repository so we exercise routing + controller logic without a DB.
vi.mock('./repository.js', () => ({
  listFlags: vi.fn(),
  getFlag: vi.fn(),
  setEnabled: vi.fn(),
  setFallthrough: vi.fn(),
  recordAudit: vi.fn(),
  listAudit: vi.fn(),
}));

// Rate limiter is a pass-through in tests to keep them deterministic.
vi.mock('../../middleware/rateLimiter.js', () => ({
  createIpLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// checkJwt: authorize when an Authorization header is present, else 401 — enough
// to test both the signed-in write path and the signed-out rejection.
vi.mock('../../config/auth.js', () => ({
  checkJwt: (req: Request, res: Response, next: NextFunction) => {
    if (!req.headers.authorization) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    (req as unknown as { auth: unknown }).auth = {
      payload: { sub: 'auth0|test', email: 'tester@example.com' },
    };
    next();
  },
}));

vi.mock('../../shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  createModuleLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { errorHandler } from '../../middleware/errorHandler.js';
import featureFlagsRoutes from './routes.js';
import * as repo from './repository.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/feature-flags', featureFlagsRoutes);
  app.use(errorHandler);
  return app;
}

const flagRow = (over: Partial<Record<string, unknown>> = {}) => ({
  key: 'dark-mode',
  name: 'Dark mode',
  description: 'Kept as a flag so it can be killed instantly.',
  kind: 'boolean',
  tags: ['ui'],
  variations: [
    { key: 'on', name: 'Enabled', value: true },
    { key: 'off', name: 'Disabled', value: false },
  ],
  environments: {
    production: {
      enabled: true,
      offVariation: 'off',
      rules: [],
      fallthrough: [{ variation: 'on', weight: 100 }],
    },
  },
  createdAt: new Date('2026-01-08T10:00:00.000Z'),
  ...over,
});

const auditRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: '00000000-0000-0000-0000-000000000001',
  flagKey: 'new-checkout',
  environment: 'production',
  action: 'rollout-changed',
  summary: 'Production rollout raised to 25% on',
  actor: 'paul@paul-explore.dev',
  createdAt: new Date('2026-07-20T18:12:00.000Z'),
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('feature-flags routes', () => {
  test('GET / returns the flags and the environment list', async () => {
    vi.mocked(repo.listFlags).mockResolvedValue([flagRow()] as never);

    const res = await request(makeApp()).get('/api/feature-flags');

    expect(res.status).toBe(200);
    expect(res.body.flags).toHaveLength(1);
    expect(res.body.flags[0].key).toBe('dark-mode');
    // createdAt is serialized to an ISO string, not a Date
    expect(res.body.flags[0].createdAt).toBe('2026-01-08T10:00:00.000Z');
    expect(res.body.environments).toEqual(['development', 'staging', 'production']);
  });

  test('GET /audit returns the change log mapped to the wire shape', async () => {
    vi.mocked(repo.listAudit).mockResolvedValue([auditRow()] as never);

    const res = await request(makeApp()).get('/api/feature-flags/audit');

    expect(res.status).toBe(200);
    expect(res.body.audit).toHaveLength(1);
    expect(res.body.audit[0].flagKey).toBe('new-checkout');
    expect(res.body.audit[0].timestamp).toBe('2026-07-20T18:12:00.000Z');
  });

  test('PATCH /:flagKey toggles the kill switch, audits it, and returns the flag', async () => {
    const updated = flagRow({
      environments: {
        production: {
          enabled: false,
          offVariation: 'off',
          rules: [],
          fallthrough: [{ variation: 'on', weight: 100 }],
        },
      },
    });
    vi.mocked(repo.setEnabled).mockResolvedValue(updated as never);
    vi.mocked(repo.recordAudit).mockResolvedValue(auditRow() as never);

    const res = await request(makeApp())
      .patch('/api/feature-flags/dark-mode')
      .set('authorization', 'Bearer token')
      .send({ environment: 'production', enabled: false });

    expect(res.status).toBe(200);
    expect(repo.setEnabled).toHaveBeenCalledWith('dark-mode', 'production', false);
    expect(res.body.environments.production.enabled).toBe(false);

    // audit records the disable, attributed to the signed-in user
    expect(repo.recordAudit).toHaveBeenCalledOnce();
    const entry = vi.mocked(repo.recordAudit).mock.calls[0][0];
    expect(entry.action).toBe('disabled');
    expect(entry.actor).toBe('tester@example.com');
  });

  test('PATCH /:flagKey updates the rollout and records a rollout-changed audit', async () => {
    vi.mocked(repo.setFallthrough).mockResolvedValue(flagRow() as never);
    vi.mocked(repo.recordAudit).mockResolvedValue(auditRow() as never);

    const res = await request(makeApp())
      .patch('/api/feature-flags/new-checkout')
      .set('authorization', 'Bearer token')
      .send({
        environment: 'production',
        fallthrough: [
          { variation: 'on', weight: 40 },
          { variation: 'off', weight: 60 },
        ],
      });

    expect(res.status).toBe(200);
    expect(repo.setFallthrough).toHaveBeenCalledOnce();
    const entry = vi.mocked(repo.recordAudit).mock.calls[0][0];
    expect(entry.action).toBe('rollout-changed');
    expect(entry.summary).toContain('40% on');
  });

  test('PATCH /:flagKey returns 404 for an unknown flag', async () => {
    vi.mocked(repo.setEnabled).mockResolvedValue(null as never);

    const res = await request(makeApp())
      .patch('/api/feature-flags/missing')
      .set('authorization', 'Bearer token')
      .send({ environment: 'production', enabled: true });

    expect(res.status).toBe(404);
    expect(repo.recordAudit).not.toHaveBeenCalled();
  });

  test('PATCH /:flagKey rejects a body with neither enabled nor fallthrough with 400', async () => {
    const res = await request(makeApp())
      .patch('/api/feature-flags/dark-mode')
      .set('authorization', 'Bearer token')
      .send({ environment: 'production' });

    expect(res.status).toBe(400);
    expect(repo.setEnabled).not.toHaveBeenCalled();
  });

  test('PATCH /:flagKey returns 401 when signed out', async () => {
    const res = await request(makeApp())
      .patch('/api/feature-flags/dark-mode')
      .send({ environment: 'production', enabled: false });

    expect(res.status).toBe(401);
    expect(repo.setEnabled).not.toHaveBeenCalled();
  });
});
