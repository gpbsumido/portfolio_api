import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const ADMIN_EMAIL = 'admin@example.com';
const REPORTER_SUB = 'auth0|reporter';
const REPORT_ID = '6f0c1a52-3f0e-4f43-9d2a-0c8f1f2d9b11';
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
  createReport: vi.fn(),
  listReportsFor: vi.fn(),
  listReports: vi.fn(),
  updateReport: vi.fn(),
}));

import { errorHandler } from '../../middleware/errorHandler.js';
import * as repo from './repository.js';
import evarRouter from './routes.js';

const reportRow = {
  id: REPORT_ID,
  reporter_sub: REPORTER_SUB,
  case_id: 'avt-r6',
  slice: 12,
  kind: 'missing-slices',
  message: 'The neck is cut off at the top of the stack.',
  status: 'open',
  admin_note: null,
  handled_by: null,
  handled_at: null,
  created_at: '2026-10-25T09:00:00.000Z',
  updated_at: '2026-10-25T09:00:00.000Z',
};

const fixedRow = {
  ...reportRow,
  status: 'fixed',
  admin_note: 'Re-cropped from the chest down.',
  handled_by: ADMIN_EMAIL,
  handled_at: '2026-10-26T09:00:00.000Z',
};

const body = { caseId: 'avt-r6', slice: 12, kind: 'missing-slices', message: 'The neck is cut off at the top of the stack.' };

const asReporter = (sub = REPORTER_SUB) => {
  claims = { sub };
};
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

describe('reporting a mistake in a scan', () => {
  test('needs sign-in', async () => {
    const res = await request(makeApp()).post('/api/evar/reports').send(body);
    expect(res.status).toBe(401);
    expect(repo.createReport).not.toHaveBeenCalled();
  });

  test('stores it against the caller and answers with the report, open', async () => {
    asReporter();
    vi.mocked(repo.createReport).mockResolvedValue(reportRow as never);
    const res = await request(makeApp()).post('/api/evar/reports').send(body);
    expect(res.status).toBe(201);
    expect(repo.createReport).toHaveBeenCalledWith(REPORTER_SUB, body);
    expect(res.body.report).toEqual({
      id: REPORT_ID,
      caseId: 'avt-r6',
      slice: 12,
      kind: 'missing-slices',
      message: 'The neck is cut off at the top of the stack.',
      status: 'open',
      adminNote: null,
      handledAt: null,
      createdAt: '2026-10-25T09:00:00.000Z',
    });
  });

  test("doesn't need a slice, because some mistakes aren't on one", async () => {
    asReporter('auth0|no-slice');
    vi.mocked(repo.createReport).mockResolvedValue({ ...reportRow, slice: null } as never);
    const { slice: _slice, ...withoutSlice } = body;
    const res = await request(makeApp()).post('/api/evar/reports').send(withoutSlice);
    expect(res.status).toBe(201);
    expect(res.body.report.slice).toBeNull();
  });

  test("never gives the reporter's subject back", async () => {
    asReporter('auth0|leaky');
    vi.mocked(repo.createReport).mockResolvedValue(reportRow as never);
    const res = await request(makeApp()).post('/api/evar/reports').send(body);
    expect(JSON.stringify(res.body)).not.toContain('auth0|');
  });

  test.each([
    ['no message', { ...body, message: '' }],
    ['a message of only spaces', { ...body, message: '    ' }],
    ['a message over 1000 characters', { ...body, message: 'x'.repeat(1001) }],
    ["a kind that isn't one of ours", { ...body, kind: 'rude' }],
    ["a case id that isn't a slug", { ...body, caseId: 'AVT R6' }],
    ['a slice of zero', { ...body, slice: 0 }],
    ['a fractional slice', { ...body, slice: 2.5 }],
    ["a field it doesn't know", { ...body, status: 'fixed' }],
  ])('rejects %s', async (_name, payload) => {
    asReporter('auth0|careful');
    const res = await request(makeApp()).post('/api/evar/reports').send(payload);
    expect(res.status).toBe(400);
    expect(repo.createReport).not.toHaveBeenCalled();
  });

  test('stops one person filing more than ten an hour', async () => {
    asReporter('auth0|spammer');
    vi.mocked(repo.createReport).mockResolvedValue(reportRow as never);
    const app = makeApp();
    for (let i = 0; i < 10; i += 1) {
      expect((await request(app).post('/api/evar/reports').send(body)).status).toBe(201);
    }
    expect((await request(app).post('/api/evar/reports').send(body)).status).toBe(429);
    expect(repo.createReport).toHaveBeenCalledTimes(10);
  });
});

describe('seeing what you reported', () => {
  test('needs sign-in', async () => {
    expect((await request(makeApp()).get('/api/evar/reports')).status).toBe(401);
  });

  test('lists your own, with whether each was handled and what the admin said', async () => {
    asReporter();
    vi.mocked(repo.listReportsFor).mockResolvedValue([fixedRow, reportRow] as never);
    const res = await request(makeApp()).get('/api/evar/reports');
    expect(res.status).toBe(200);
    expect(repo.listReportsFor).toHaveBeenCalledWith(REPORTER_SUB, 100);
    expect(res.body.reports.map((r: { status: string }) => r.status)).toEqual(['fixed', 'open']);
    expect(res.body.reports[0]).toMatchObject({ adminNote: 'Re-cropped from the chest down.', handledAt: '2026-10-26T09:00:00.000Z' });
  });

  test("doesn't say which admin handled it", async () => {
    asReporter();
    vi.mocked(repo.listReportsFor).mockResolvedValue([fixedRow] as never);
    const res = await request(makeApp()).get('/api/evar/reports');
    expect(JSON.stringify(res.body)).not.toContain('@');
    expect(JSON.stringify(res.body)).not.toContain('auth0|');
  });
});

describe('the admin queue', () => {
  test('is admin only', async () => {
    asReporter();
    const res = await request(makeApp()).get('/api/evar/admin/reports');
    expect(res.status).toBe(403);
    expect(repo.listReports).not.toHaveBeenCalled();
  });

  test("shows what's open unless asked for more", async () => {
    asAdmin();
    vi.mocked(repo.listReports).mockResolvedValue([reportRow] as never);
    const res = await request(makeApp()).get('/api/evar/admin/reports');
    expect(res.status).toBe(200);
    expect(repo.listReports).toHaveBeenCalledWith('open');
    expect(res.body.reports).toHaveLength(1);
  });

  test.each(['open', 'fixed', 'all'])('can ask for %s', async (status) => {
    asAdmin();
    vi.mocked(repo.listReports).mockResolvedValue([] as never);
    const res = await request(makeApp()).get(`/api/evar/admin/reports?status=${status}`);
    expect(res.status).toBe(200);
    expect(repo.listReports).toHaveBeenCalledWith(status);
  });

  test("rejects a status it doesn't know", async () => {
    asAdmin();
    const res = await request(makeApp()).get('/api/evar/admin/reports?status=pending');
    expect(res.status).toBe(400);
  });

  test('keeps the reporter anonymous even to the admin', async () => {
    asAdmin();
    vi.mocked(repo.listReports).mockResolvedValue([reportRow] as never);
    const res = await request(makeApp()).get('/api/evar/admin/reports');
    expect(JSON.stringify(res.body)).not.toContain('auth0|');
  });
});

describe('handling a report', () => {
  const patch = (payload: unknown, id = REPORT_ID) => request(makeApp()).patch(`/api/evar/admin/reports/${id}`).send(payload as object);

  test('is admin only', async () => {
    asReporter();
    const res = await patch({ status: 'fixed' });
    expect(res.status).toBe(403);
    expect(repo.updateReport).not.toHaveBeenCalled();
  });

  test('marks it fixed with a note for the reporter, and records who did it', async () => {
    asAdmin();
    vi.mocked(repo.updateReport).mockResolvedValue(fixedRow as never);
    const res = await patch({ status: 'fixed', adminNote: 'Re-cropped from the chest down.' });
    expect(res.status).toBe(200);
    expect(repo.updateReport).toHaveBeenCalledWith(REPORT_ID, { status: 'fixed', adminNote: 'Re-cropped from the chest down.' }, ADMIN_EMAIL);
    expect(res.body.report).toMatchObject({ id: REPORT_ID, status: 'fixed', handledAt: '2026-10-26T09:00:00.000Z' });
    expect(JSON.stringify(res.body)).not.toContain('@');
  });

  test('can reopen one, and leaves the note alone when none is sent', async () => {
    asAdmin();
    vi.mocked(repo.updateReport).mockResolvedValue(reportRow as never);
    const res = await patch({ status: 'open' });
    expect(res.status).toBe(200);
    expect(repo.updateReport).toHaveBeenCalledWith(REPORT_ID, { status: 'open' }, ADMIN_EMAIL);
  });

  test('can clear the note with null', async () => {
    asAdmin();
    vi.mocked(repo.updateReport).mockResolvedValue(reportRow as never);
    await patch({ status: 'open', adminNote: null });
    expect(repo.updateReport).toHaveBeenCalledWith(REPORT_ID, { status: 'open', adminNote: null }, ADMIN_EMAIL);
  });

  test("is a 404 for a report that isn't there", async () => {
    asAdmin();
    vi.mocked(repo.updateReport).mockResolvedValue(null);
    expect((await patch({ status: 'fixed' })).status).toBe(404);
  });

  test.each([
    ['no status', {}],
    ["a status it doesn't know", { status: 'wontfix' }],
    ['a note over 500 characters', { status: 'fixed', adminNote: 'x'.repeat(501) }],
    ["a field it doesn't know", { status: 'fixed', message: 'edited' }],
  ])('rejects %s', async (_name, payload) => {
    asAdmin();
    expect((await patch(payload)).status).toBe(400);
    expect(repo.updateReport).not.toHaveBeenCalled();
  });

  test("rejects an id that isn't a uuid", async () => {
    asAdmin();
    expect((await patch({ status: 'fixed' }, 'not-a-uuid')).status).toBe(400);
  });
});
