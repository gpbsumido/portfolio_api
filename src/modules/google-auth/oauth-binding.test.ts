import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const VICTIM = 'auth0|victim';
const ATTACKER = 'auth0|attacker';
const ORIGIN = 'https://paulsumido.com';

const caller = vi.hoisted(() => {
  process.env.GOOGLE_STATE_SECRET = 'test-state-secret';
  process.env.GOOGLE_CLIENT_ID = 'client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
  process.env.GOOGLE_REDIRECT_URI = 'https://api.example.com/api/google/auth/callback';
  return { sub: 'auth0|victim' };
});

vi.mock('../../config/auth.js', () => ({
  checkJwt: (req: any, _res: any, next: any) => {
    req.auth = { payload: { sub: caller.sub } };
    next();
  },
  optionalCheckJwt: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('./service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./service.js')>()),
  upsertGoogleAuth: vi.fn(),
  registerWatch: vi.fn(),
  findChannelOwner: vi.fn(),
  getCalendarByGoogleCalId: vi.fn(),
  fetchIncrementalEvents: vi.fn(),
  updateCalendar: vi.fn(),
  updateSyncToken: vi.fn(),
  getEventByGoogleId: vi.fn(),
  processExistingItem: vi.fn(),
  getGoogleAuth: vi.fn(),
}));

import googleRouter from './routes.js';
import { GoogleAuthController } from './controller.js';
import * as service from './service.js';
import { errorHandler } from '../../middleware/errorHandler.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/google', googleRouter);
  app.use(errorHandler);
  return app;
}

const googleTokenResponse = () =>
  new Response(JSON.stringify({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  vi.clearAllMocks();
  caller.sub = VICTIM;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(googleTokenResponse()));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Google OAuth is bound to the signed-in user', () => {
  test('the callback hands the code back to the frontend instead of storing tokens', async () => {
    const state = service.buildState(VICTIM, ORIGIN);

    const res = await request(makeApp()).get('/api/google/auth/callback').query({ code: 'the-code', state });

    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(`${location.origin}${location.pathname}`).toBe(`${ORIGIN}/settings`);
    expect(location.searchParams.get('gcal')).toBe('confirm');
    expect(location.searchParams.get('code')).toBe('the-code');
    expect(location.searchParams.get('state')).toBe(state);
    expect(fetch).not.toHaveBeenCalled();
    expect(service.upsertGoogleAuth).not.toHaveBeenCalled();
  });

  test("a code started by someone else can't be confirmed into their account", async () => {
    const attackersState = service.buildState(ATTACKER, ORIGIN);

    const res = await request(makeApp())
      .post('/api/google/auth/confirm')
      .send({ code: 'victims-code', state: attackersState });

    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
    expect(service.upsertGoogleAuth).not.toHaveBeenCalled();
  });

  test('confirming your own code stores the tokens under you', async () => {
    const state = service.buildState(VICTIM, ORIGIN);

    const res = await request(makeApp()).post('/api/google/auth/confirm').send({ code: 'my-code', state });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ connected: true });
    expect(service.upsertGoogleAuth).toHaveBeenCalledWith(VICTIM, expect.objectContaining({ accessToken: 'access' }));
    expect(service.registerWatch).toHaveBeenCalledWith(VICTIM);
  });

  test('a state older than ten minutes is refused', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-19T10:00:00Z'));
    const state = service.buildState(VICTIM, ORIGIN);
    vi.setSystemTime(new Date('2026-11-19T10:11:00Z'));

    const res = await request(makeApp()).post('/api/google/auth/confirm').send({ code: 'my-code', state });

    expect(res.status).toBe(400);
    expect(service.upsertGoogleAuth).not.toHaveBeenCalled();
  });
});

describe('Google webhook', () => {
  test('keeps the old sync token when an item fails, so the next push retries it', async () => {
    vi.mocked(service.findChannelOwner).mockResolvedValue({ userId: VICTIM, googleCalId: 'family@google' });
    vi.mocked(service.getCalendarByGoogleCalId).mockResolvedValue({
      id: 'calendar-1',
      syncToken: 'old-token',
      syncMode: 'two_way',
    });
    vi.mocked(service.fetchIncrementalEvents).mockResolvedValue({
      items: [{ id: 'google-event-1' }] as never,
      nextSyncToken: 'new-token',
    });
    vi.mocked(service.getEventByGoogleId).mockResolvedValue({ id: 'event-1' });
    vi.mocked(service.processExistingItem).mockRejectedValue(new Error('database hiccup'));

    await new GoogleAuthController().handleWebhook(
      { headers: { 'x-goog-channel-id': 'channel-1', 'x-goog-resource-state': 'exists' } } as never,
      { sendStatus: vi.fn() } as never,
      vi.fn() as never,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(service.updateCalendar).not.toHaveBeenCalled();
  });
});
