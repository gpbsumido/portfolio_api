import { describe, expect, test } from 'vitest';
import { dedupeByEventUuid } from './repository.js';

/**
 * A batch can carry the same event_uuid twice — a retry that overlaps a
 * beacon, two flushes racing. Postgres refuses to apply ON CONFLICT DO NOTHING
 * to the same row twice in one statement ("cannot affect row a second time"),
 * so the batch has to be deduped before it reaches the insert. First write wins.
 */
describe('dedupeByEventUuid', () => {
  const event = (eventUuid: string, seq: number) => ({
    eventUuid,
    name: 'page_view',
    page: '/zeroproof',
    seq,
    sessionId: 's1',
    anonId: 'a1',
    clientTs: '2026-09-29T00:00:00.000Z',
    appVersion: '7.9.3',
  });

  test('keeps the first occurrence of each event_uuid', () => {
    const deduped = dedupeByEventUuid([event('u1', 1), event('u2', 2), event('u1', 99)]);

    expect(deduped).toHaveLength(2);
    expect(deduped.map((e) => e.eventUuid)).toEqual(['u1', 'u2']);
    expect(deduped[0]?.seq).toBe(1);
  });

  test('leaves a batch with no duplicates untouched', () => {
    const batch = [event('u1', 1), event('u2', 2), event('u3', 3)];
    expect(dedupeByEventUuid(batch)).toEqual(batch);
  });

  test('an empty batch stays empty', () => {
    expect(dedupeByEventUuid([])).toEqual([]);
  });
});
