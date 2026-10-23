import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const ADMIN_EMAIL = 'admin@example.com';
let claims: Record<string, unknown> = { sub: 'auth0|trainee' };

vi.mock('../../config/auth.js', () => ({
  checkJwt: (req: any, _res: any, next: any) => {
    req.auth = { payload: claims };
    next();
  },
  optionalCheckJwt: (req: any, _res: any, next: any) => next(),
}));

vi.mock('./repository.js', () => ({
  getParticipant: vi.fn(),
  upsertParticipant: vi.fn(),
  deleteParticipant: vi.fn(),
  recordAttempt: vi.fn(),
  listAttempts: vi.fn(),
  exportAll: vi.fn(),
}));

import { errorHandler } from '../../middleware/errorHandler.js';
import * as repo from './repository.js';
import evarRouter from './routes.js';

const PARTICIPANT_ID = '22222222-2222-4222-8222-222222222222';
const ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';
const CLIENT_ATTEMPT_ID = '44444444-4444-4444-8444-444444444444';

const participantRow = {
  id: PARTICIPANT_ID,
  auth_sub: 'auth0|trainee',
  consent_version: '2026-10-draft',
  consented_at: '2026-10-22T09:00:00.000Z',
  training_level: 'resident',
  training_year: 3,
  specialty: 'Vascular surgery',
  created_at: '2026-10-22T09:00:00.000Z',
  updated_at: '2026-10-22T09:00:00.000Z',
};

const attemptRow = {
  id: ATTEMPT_ID,
  participant_id: PARTICIPANT_ID,
  client_attempt_id: CLIENT_ATTEMPT_ID,
  case_id: 'hostile-neck',
  level: 'hard',
  app_version: '7.18.0',
  started_at: '2026-10-22T09:00:00.000Z',
  submitted_at: '2026-10-22T09:04:12.000Z',
  duration_ms: 252_000,
  time_limit_ms: 300_000,
  timed_out: false,
  measurements: { neckDiameter: 29.4 },
  scores: [{ id: 'neckDiameter', yours: 29.4, reference: 30, verdict: 'within' }],
  devices: null,
  created_at: '2026-10-22T09:04:12.000Z',
};

const attemptBody = {
  clientAttemptId: CLIENT_ATTEMPT_ID,
  caseId: 'hostile-neck',
  level: 'hard',
  appVersion: '7.18.0',
  startedAt: '2026-10-22T09:00:00.000Z',
  submittedAt: '2026-10-22T09:04:12.000Z',
  durationMs: 252_000,
  timeLimitMs: 300_000,
  timedOut: false,
  measurements: { neckDiameter: 29.4 },
  scores: [{ id: 'neckDiameter', yours: 29.4, reference: 30, verdict: 'within' }],
  devices: null,
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
  claims = { sub: 'auth0|trainee' };
  process.env.ADMIN_ALLOWED_EMAILS = ADMIN_EMAIL;
  vi.mocked(repo.getParticipant).mockResolvedValue(participantRow as never);
});

describe('participant', () => {
  test('says when the caller has not joined', async () => {
    vi.mocked(repo.getParticipant).mockResolvedValue(null);
    const res = await request(makeApp()).get('/api/evar/participant');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ participant: null });
    expect(repo.getParticipant).toHaveBeenCalledWith('auth0|trainee');
  });

  test('joins with consent and a profile, and never echoes the sub', async () => {
    vi.mocked(repo.upsertParticipant).mockResolvedValue(participantRow as never);
    const res = await request(makeApp())
      .put('/api/evar/participant')
      .send({ consentVersion: '2026-10-draft', trainingLevel: 'resident', trainingYear: 3, specialty: 'Vascular surgery' });
    expect(res.status).toBe(200);
    expect(res.body.participant).toMatchObject({
      id: PARTICIPANT_ID,
      consentVersion: '2026-10-draft',
      trainingLevel: 'resident',
      trainingYear: 3,
    });
    expect(JSON.stringify(res.body)).not.toContain('auth0|');
    expect(repo.upsertParticipant).toHaveBeenCalledWith('auth0|trainee', expect.objectContaining({ trainingLevel: 'resident' }));
  });

  test('rejects a profile without a training level', async () => {
    const res = await request(makeApp()).put('/api/evar/participant').send({ consentVersion: '2026-10-draft' });
    expect(res.status).toBe(400);
    expect(repo.upsertParticipant).not.toHaveBeenCalled();
  });

  test('withdrawing deletes the participant and everything they recorded', async () => {
    vi.mocked(repo.deleteParticipant).mockResolvedValue(true);
    const res = await request(makeApp()).delete('/api/evar/participant');
    expect(res.status).toBe(204);
    expect(repo.deleteParticipant).toHaveBeenCalledWith('auth0|trainee');
  });

  test('needs a subject on the token', async () => {
    claims = {};
    const res = await request(makeApp()).get('/api/evar/participant');
    expect(res.status).toBe(401);
  });
});

describe('attempts', () => {
  test('refuses to record anything without consent', async () => {
    vi.mocked(repo.getParticipant).mockResolvedValue(null);
    const res = await request(makeApp()).post('/api/evar/attempts').send(attemptBody);
    expect(res.status).toBe(403);
    expect(repo.recordAttempt).not.toHaveBeenCalled();
  });

  test('records an attempt against the participant', async () => {
    vi.mocked(repo.recordAttempt).mockResolvedValue({ status: 'recorded', attempt: attemptRow } as never);
    const res = await request(makeApp()).post('/api/evar/attempts').send(attemptBody);
    expect(res.status).toBe(201);
    expect(res.body.attempt).toMatchObject({ id: ATTEMPT_ID, caseId: 'hostile-neck', level: 'hard' });
    expect(repo.recordAttempt).toHaveBeenCalledWith(PARTICIPANT_ID, expect.objectContaining({ clientAttemptId: CLIENT_ATTEMPT_ID }));
  });

  test('a resent attempt is stored once', async () => {
    vi.mocked(repo.recordAttempt).mockResolvedValue({ status: 'already', attempt: attemptRow } as never);
    const res = await request(makeApp()).post('/api/evar/attempts').send(attemptBody);
    expect(res.status).toBe(200);
    expect(res.body.attempt.id).toBe(ATTEMPT_ID);
  });

  test('rejects an attempt at a level that does not exist', async () => {
    const res = await request(makeApp()).post('/api/evar/attempts').send({ ...attemptBody, level: 'nightmare' });
    expect(res.status).toBe(400);
  });

  test('lists only the caller\'s own attempts', async () => {
    vi.mocked(repo.listAttempts).mockResolvedValue([attemptRow] as never);
    const res = await request(makeApp()).get('/api/evar/attempts');
    expect(res.status).toBe(200);
    expect(res.body.attempts).toHaveLength(1);
    expect(repo.listAttempts).toHaveBeenCalledWith(PARTICIPANT_ID, 100);
  });

  test('lists nothing for someone who has not joined', async () => {
    vi.mocked(repo.getParticipant).mockResolvedValue(null);
    const res = await request(makeApp()).get('/api/evar/attempts');
    expect(res.body).toEqual({ attempts: [] });
    expect(repo.listAttempts).not.toHaveBeenCalled();
  });
});

describe('admin export', () => {
  test('is admin only', async () => {
    const res = await request(makeApp()).get('/api/evar/admin/export');
    expect(res.status).toBe(403);
    expect(repo.exportAll).not.toHaveBeenCalled();
  });

  test('is pseudonymous: participant ids, never subs or emails', async () => {
    claims = {
      sub: 'auth0|admin',
      'https://paulsumido.com/email': ADMIN_EMAIL,
      'https://paulsumido.com/email_verified': true,
    };
    vi.mocked(repo.exportAll).mockResolvedValue({ participants: [participantRow], attempts: [attemptRow] } as never);
    const res = await request(makeApp()).get('/api/evar/admin/export');
    expect(res.status).toBe(200);
    expect(res.body.participants[0]).toMatchObject({ id: PARTICIPANT_ID, trainingLevel: 'resident' });
    expect(res.body.attempts[0]).toMatchObject({ participantId: PARTICIPANT_ID, durationMs: 252_000 });
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('auth0|');
    expect(body).not.toContain('@');
  });
});
