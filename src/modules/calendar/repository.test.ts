import { describe, test, expect, vi, type Mock } from 'vitest';
import type { Knex } from 'knex';

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
import knexFactory from 'knex';

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

const cardRow = {
  id: 'entry-1',
  event_id: 'event-1',
  card_id: 'sv1-1',
  card_name: 'Sprigatito',
  card_set_id: null,
  card_set_name: null,
  card_image_url: null,
  quantity: 3,
  notes: 'trade bait',
  created_at: new Date('2026-11-20T12:00:00Z'),
};

/**
 * The knex mock above takes any SQL, which is how a statement knex itself
 * refuses got through. Knex binds `?`, not `$1`: given `$1` and an array it
 * throws "Expected 5 bindings, saw 0" for this update before Postgres sees anything. Compiling
 * with the real knex is enough to catch that without a database.
 */
describe('CalendarRepository card updates', () => {
  test('updateEventCard builds a statement knex will bind', async () => {
    const { default: realKnex } = await vi.importActual<{ default: (config: Knex.Config) => Knex }>('knex');
    const compiler = realKnex({ client: 'pg' });
    const db = (knexFactory as unknown as () => { raw: Mock })();
    db.raw.mockImplementationOnce(async (sql: string, bindings: readonly unknown[]) => {
      compiler.raw(sql, bindings).toSQL();
      return { rows: [cardRow] };
    });

    const card = await new CalendarRepository().updateEventCard(
      'entry-1',
      'event-1',
      { quantity: 3, notes: 'trade bait' },
      'auth0|owner',
    );

    expect(card).toMatchObject({ id: 'entry-1', quantity: 3, notes: 'trade bait' });
  });
});
