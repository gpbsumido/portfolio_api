import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

let claims: Record<string, unknown> = { sub: 'auth0|volunteer' };

vi.mock('../../config/auth.js', () => ({
  checkJwt: (req: any, _res: any, next: any) => {
    req.auth = { payload: claims };
    next();
  },
  optionalCheckJwt: (req: any, _res: any, next: any) => next(),
}));

vi.mock('./repository.js', () => ({
  listSites: vi.fn(),
  createSite: vi.fn(),
  getOwnedSite: vi.fn(),
  getSite: vi.fn(),
  recordArrival: vi.fn(),
  listArrivals: vi.fn(),
  failedAttempts: vi.fn(),
  recordFailedAttempt: vi.fn(),
}));

import { errorHandler } from '../../middleware/errorHandler.js';
import { deriveCode, windowAt } from './codes.js';
import * as repo from './repository.js';
import checkInRouter from './routes.js';

const SITE_ID = '11111111-1111-4111-8111-111111111111';
const SALT = 'salt-for-tests';

const site = {
  id: SITE_ID,
  owner_sub: 'auth0|organizer',
  name: 'Riverside Food Bank',
  code_salt: SALT,
  period_seconds: 120,
  created_at: '2026-08-30T09:00:00.000Z',
  archived_at: null,
};

const arrival = {
  id: 'a1',
  site_id: SITE_ID,
  volunteer_sub: 'auth0|volunteer',
  volunteer_email: 'vol@example.com',
  window_start: 1,
  created_at: '2026-08-30T09:04:00.000Z',
};

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/check-in', checkInRouter);
  app.use(errorHandler);
  return app;
}

/** The code a volunteer standing at the display would be reading right now. */
const liveCode = () => deriveCode(SALT, windowAt(Date.now()));

const originalSecret = process.env.CHECKIN_CODE_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  claims = { sub: 'auth0|volunteer' };
  process.env.CHECKIN_CODE_SECRET = 'test-secret-not-a-real-one';
  vi.mocked(repo.getSite).mockResolvedValue(site as never);
  vi.mocked(repo.failedAttempts).mockResolvedValue(0);
  vi.mocked(repo.recordFailedAttempt).mockResolvedValue(1);
  vi.mocked(repo.recordArrival).mockResolvedValue({
    arrival,
    created: true,
  } as never);
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CHECKIN_CODE_SECRET;
  else process.env.CHECKIN_CODE_SECRET = originalSecret;
});

describe('POST /api/check-in/arrivals', () => {
  test('records an arrival for the code on the display', async () => {
    const res = await request(makeApp())
      .post('/api/check-in/arrivals')
      .send({ siteId: SITE_ID, code: liveCode() });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('recorded');
    expect(res.body.siteName).toBe('Riverside Food Bank');
    expect(repo.recordArrival).toHaveBeenCalledWith(
      expect.objectContaining({ siteId: SITE_ID, volunteerSub: 'auth0|volunteer' }),
    );
  });

  test('answers 200 already, not a second arrival, on a repeat submit', async () => {
    vi.mocked(repo.recordArrival).mockResolvedValue({
      arrival,
      created: false,
    } as never);

    const res = await request(makeApp())
      .post('/api/check-in/arrivals')
      .send({ siteId: SITE_ID, code: liveCode() });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('already');
  });

  test('rejects a wrong code and counts the attempt', async () => {
    const wrong = liveCode() === '000000' ? '111111' : '000000';
    const res = await request(makeApp())
      .post('/api/check-in/arrivals')
      .send({ siteId: SITE_ID, code: wrong });

    expect(res.status).toBe(400);
    expect(repo.recordFailedAttempt).toHaveBeenCalledTimes(1);
    expect(repo.recordArrival).not.toHaveBeenCalled();
  });

  test('refuses once the attempt ceiling is reached, without checking the code', async () => {
    vi.mocked(repo.failedAttempts).mockResolvedValue(5);

    const res = await request(makeApp())
      .post('/api/check-in/arrivals')
      .send({ siteId: SITE_ID, code: liveCode() });

    // Even a correct code is refused: the ceiling is checked first, so being
    // throttled leaks nothing about whether the guess was right.
    expect(res.status).toBe(429);
    expect(repo.recordArrival).not.toHaveBeenCalled();
  });

  test('rejects a code that is not six digits before any lookup', async () => {
    const res = await request(makeApp())
      .post('/api/check-in/arrivals')
      .send({ siteId: SITE_ID, code: '12ab' });

    expect(res.status).toBe(400);
    expect(repo.getSite).not.toHaveBeenCalled();
  });

  test('404s an unknown site', async () => {
    vi.mocked(repo.getSite).mockResolvedValue(null as never);

    const res = await request(makeApp())
      .post('/api/check-in/arrivals')
      .send({ siteId: SITE_ID, code: liveCode() });

    expect(res.status).toBe(404);
  });

  test('fails closed when no code secret is configured', async () => {
    delete process.env.CHECKIN_CODE_SECRET;

    const res = await request(makeApp())
      .post('/api/check-in/arrivals')
      .send({ siteId: SITE_ID, code: '123456' });

    expect(res.status).toBe(500);
    expect(repo.recordArrival).not.toHaveBeenCalled();
  });
});

describe('GET /api/check-in/sites/:id/code', () => {
  test('gives the owner a code and the seconds it has left', async () => {
    claims = { sub: 'auth0|organizer' };
    vi.mocked(repo.getOwnedSite).mockResolvedValue(site as never);

    const res = await request(makeApp()).get(`/api/check-in/sites/${SITE_ID}/code`);

    expect(res.status).toBe(200);
    expect(res.body.code).toMatch(/^\d{6}$/);
    expect(res.body.secondsRemaining).toBeGreaterThan(0);
    expect(res.body.secondsRemaining).toBeLessThanOrEqual(120);
    expect(repo.getOwnedSite).toHaveBeenCalledWith(SITE_ID, 'auth0|organizer');
  });

  test('reads as missing rather than forbidden for a site you do not own', async () => {
    // Ownership is in the query, so a stranger gets 404 and cannot use this to
    // discover which site ids exist.
    vi.mocked(repo.getOwnedSite).mockResolvedValue(null as never);

    const res = await request(makeApp()).get(`/api/check-in/sites/${SITE_ID}/code`);

    expect(res.status).toBe(404);
  });
});

describe('GET /api/check-in/sites/:id/arrivals', () => {
  test('lists the roster for the owner', async () => {
    claims = { sub: 'auth0|organizer' };
    vi.mocked(repo.getOwnedSite).mockResolvedValue(site as never);
    vi.mocked(repo.listArrivals).mockResolvedValue([arrival] as never);

    const res = await request(makeApp()).get(`/api/check-in/sites/${SITE_ID}/arrivals`);

    expect(res.status).toBe(200);
    expect(res.body.arrivals).toEqual([
      { id: 'a1', email: 'vol@example.com', at: '2026-08-30T09:04:00.000Z' },
    ]);
  });

  test('404s the roster for a site you do not own', async () => {
    vi.mocked(repo.getOwnedSite).mockResolvedValue(null as never);

    const res = await request(makeApp()).get(`/api/check-in/sites/${SITE_ID}/arrivals`);

    expect(res.status).toBe(404);
    expect(repo.listArrivals).not.toHaveBeenCalled();
  });
});

describe('sites', () => {
  test('lists only the caller s own sites', async () => {
    vi.mocked(repo.listSites).mockResolvedValue([site] as never);

    const res = await request(makeApp()).get('/api/check-in/sites');

    expect(res.status).toBe(200);
    expect(repo.listSites).toHaveBeenCalledWith('auth0|volunteer');
    expect(res.body.sites).toEqual([
      { id: SITE_ID, name: 'Riverside Food Bank', periodSeconds: 120 },
    ]);
  });

  test('creates a site without letting the caller choose its salt', async () => {
    vi.mocked(repo.createSite).mockResolvedValue(site as never);

    const res = await request(makeApp())
      .post('/api/check-in/sites')
      .send({ name: 'Riverside Food Bank', code_salt: 'chosen-by-me' });

    // .strict() on the schema means the extra key is a 400, not a silently
    // stripped field that might one day be read.
    expect(res.status).toBe(400);
    expect(repo.createSite).not.toHaveBeenCalled();
  });

  test('creates a site from a name alone', async () => {
    vi.mocked(repo.createSite).mockResolvedValue(site as never);

    const res = await request(makeApp())
      .post('/api/check-in/sites')
      .send({ name: 'Riverside Food Bank' });

    expect(res.status).toBe(201);
    expect(repo.createSite).toHaveBeenCalledWith('auth0|volunteer', 'Riverside Food Bank');
  });
});
