import { describe, test, expect, vi } from 'vitest';

const { calendarRow } = vi.hoisted(() => ({
  // What `.returning('*')` hands back for a calendars row: there is no role
  // column, so none arrives here.
  calendarRow: {
    id: 'cal-1',
    name: 'Personal',
    color: '#3b82f6',
    user_sub: 'auth0|owner',
    google_cal_id: null,
    google_cal_name: null,
    sync_mode: 'none',
    channel_id: null,
    resource_id: null,
    channel_expiry: null,
    sync_token: null,
    created_at: new Date('2026-11-19T12:00:00Z'),
    updated_at: new Date('2026-11-19T12:00:00Z'),
  },
}));

vi.mock('knex', () => {
  const builder: Record<string, unknown> = {};
  for (const method of ['insert', 'where', 'update']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.returning = vi.fn(async () => [calendarRow]);
  const db = Object.assign(
    vi.fn(() => builder),
    { raw: vi.fn() },
  );
  return { default: vi.fn(() => db) };
});

import { CalendarRepository } from './repository.js';

/**
 * The web app validates the body of every create and update response and
 * requires a `role`. The list query gets one from its membership join, but a
 * row coming back from an insert or update has no role column, so the response
 * had none and the app threw after the write had already committed. Only an
 * owner can reach either write, so the role is known.
 */
describe('CalendarRepository writes', () => {
  test('createCalendar answers with the caller as owner', async () => {
    const calendar = await new CalendarRepository().createCalendar(
      { name: 'Personal' },
      'auth0|owner',
    );

    expect(calendar).toMatchObject({ id: 'cal-1', name: 'Personal', role: 'owner' });
  });

  test('updateCalendar answers with the caller as owner', async () => {
    const calendar = await new CalendarRepository().updateCalendar(
      'cal-1',
      { name: 'Renamed' },
      'auth0|owner',
    );

    expect(calendar).toMatchObject({ id: 'cal-1', role: 'owner' });
  });
});
