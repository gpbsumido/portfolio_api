import { createRequire } from 'node:module';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// The token helpers are CommonJS and require utils/db themselves, so the test
// loads them the same way to patch the one db instance they actually use.
const requireCommonJs = createRequire(__filename);
const db = requireCommonJs('../../../utils/db');
const { getTokenAndCalId } = requireCommonJs('../../../utils/googleToken');
const { createGoogleEvent } = requireCommonJs('../../../utils/googleCalendar');

const USER = 'auth0|user';

const staleAuthRow = {
  user_id: USER,
  access_token: 'old-access',
  refresh_token: 'refresh',
  token_expiry: new Date(Date.now() - 60_000),
  google_cal_id: 'primary',
};

beforeEach(() => {
  vi.spyOn(db, 'getGoogleAuth').mockResolvedValue(staleAuthRow);
  vi.spyOn(db, 'deleteGoogleAuth').mockResolvedValue(undefined);
  vi.spyOn(db, 'upsertGoogleAuth').mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Google token failures', () => {
  test('a revoked refresh token removes the connection, so status stops saying connected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })),
    );

    await expect(getTokenAndCalId(USER)).rejects.toThrow();
    expect(db.deleteGoogleAuth).toHaveBeenCalledWith(USER);
  });

  test('a network failure during refresh fails the push instead of skipping it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    await expect(
      createGoogleEvent(USER, { title: 'Dinner', startDate: '2026-11-20', endDate: '2026-11-20', allDay: true }, 'primary'),
    ).rejects.toThrow('fetch failed');
    expect(db.deleteGoogleAuth).not.toHaveBeenCalled();
  });

  test('a user who never connected is still skipped quietly', async () => {
    vi.mocked(db.getGoogleAuth).mockResolvedValue(null);

    await expect(
      createGoogleEvent(USER, { title: 'Dinner', startDate: '2026-11-20', endDate: '2026-11-20', allDay: true }, 'primary'),
    ).resolves.toBeNull();
  });
});
