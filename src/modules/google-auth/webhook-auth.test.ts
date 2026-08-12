import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('./service.js', () => ({
  findChannelOwner: vi.fn(),
  getCalendarByGoogleCalId: vi.fn().mockResolvedValue(null),
  fetchIncrementalEvents: vi.fn().mockResolvedValue({ items: [], nextSyncToken: null }),
  registerWatch: vi.fn(),
  stopWatch: vi.fn(),
  ALLOWED_ORIGINS: [],
  buildState: vi.fn(),
  verifyState: vi.fn(),
  fromGoogleEvent: vi.fn(),
  processExistingItem: vi.fn(),
  getGoogleAuth: vi.fn(),
  upsertGoogleAuth: vi.fn(),
  deleteGoogleAuth: vi.fn(),
  updateCalendar: vi.fn(),
  getEventByGoogleId: vi.fn(),
  createCalendarEventFromWebhook: vi.fn(),
  updateSyncToken: vi.fn(),
}));

import { GoogleAuthController } from './controller.js';
import { findChannelOwner, getCalendarByGoogleCalId } from './service.js';

const VICTIM = 'auth0|victim';
const ATTACKER = 'auth0|attacker';

const res = () => ({ sendStatus: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() });

/** The handler responds immediately and syncs off the queue, so let it settle. */
const flush = () => new Promise((r) => setTimeout(r, 0));

async function webhook(headers: Record<string, string>) {
  await new GoogleAuthController().handleWebhook(
    { headers } as never,
    res() as never,
    vi.fn() as never,
  );
  await flush();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('google webhook authentication', () => {
  test('an unrecognised channel id does no work', async () => {
    vi.mocked(findChannelOwner).mockResolvedValue(null as never);

    await webhook({
      'x-goog-channel-token': `${VICTIM}:primary`,
      'x-goog-channel-id': 'guessed-channel',
      'x-goog-resource-state': 'exists',
    });

    expect(getCalendarByGoogleCalId).not.toHaveBeenCalled();
  });

  test('identity comes from the stored channel, not the caller-supplied token', async () => {
    vi.mocked(findChannelOwner).mockResolvedValue({
      userId: VICTIM,
      googleCalId: 'primary',
    } as never);

    await webhook({
      'x-goog-channel-token': `${ATTACKER}:primary`,
      'x-goog-channel-id': 'real-channel-uuid',
      'x-goog-resource-state': 'exists',
    });

    const calls = vi.mocked(getCalendarByGoogleCalId).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][1]).toBe(VICTIM);
    expect(calls.flat()).not.toContain(ATTACKER);
  });

  test('a notification with no channel id is ignored before any lookup', async () => {
    await webhook({
      'x-goog-channel-token': `${VICTIM}:primary`,
      'x-goog-resource-state': 'exists',
    });

    expect(findChannelOwner).not.toHaveBeenCalled();
    expect(getCalendarByGoogleCalId).not.toHaveBeenCalled();
  });
});
