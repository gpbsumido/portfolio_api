import { describe, test, expect, vi, beforeEach } from 'vitest';
import { pool } from '../../config/database.js';
import { listReviews, saveReview, importReviews } from './repository.js';

const sqlOf = (i: number) =>
  String((vi.mocked(pool.query).mock.calls as unknown[][])[i]?.[0] ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const paramsOf = (i: number) => (vi.mocked(pool.query).mock.calls as unknown[][])[i]?.[1] as unknown[];

const row = {
  kind: 'problem',
  item_id: 'two-sum',
  step: 1,
  due_at: new Date('2026-11-07T12:00:00.000Z'),
  last_reviewed_at: new Date('2026-11-04T12:00:00.000Z'),
  reviews: 2,
};

const dto = {
  kind: 'problem',
  itemId: 'two-sum',
  step: 1,
  dueAt: '2026-11-07T12:00:00.000Z',
  lastReviewedAt: '2026-11-04T12:00:00.000Z',
  reviews: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as never);
});

describe('listReviews', () => {
  test('reads only the caller’s rows and maps them to the camelCase shape', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [row], rowCount: 1 } as never);

    expect(await listReviews('u1')).toEqual([dto]);
    expect(sqlOf(0)).toContain('from practice_reviews where user_sub = $1');
    expect(paramsOf(0)).toEqual(['u1']);
  });
});

describe('saveReview', () => {
  test('upserts, keeping whichever review happened later', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [row], rowCount: 1 } as never);

    expect(await saveReview('u1', dto as never)).toEqual(dto);
    expect(sqlOf(0)).toContain('on conflict (user_sub, kind, item_id) do update');
    expect(sqlOf(0)).toContain('where practice_reviews.last_reviewed_at <= excluded.last_reviewed_at');
    expect(paramsOf(0)).toEqual(['u1', 'problem', 'two-sum', 1, dto.dueAt, dto.lastReviewedAt, 2]);
  });

  test('returns the stored row when a newer review already beat this one', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
      .mockResolvedValueOnce({ rows: [row], rowCount: 1 } as never);

    expect(await saveReview('u1', { ...dto, step: 0 } as never)).toEqual(dto);
    expect(sqlOf(1)).toContain('where user_sub = $1 and kind = $2 and item_id = $3');
  });
});

describe('importReviews', () => {
  test('merges the whole batch in one statement, then returns the full set', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [], rowCount: 2 } as never)
      .mockResolvedValueOnce({ rows: [row], rowCount: 1 } as never);
    const drill = { ...dto, kind: 'drill', itemId: 'valid-anagram' };

    expect(await importReviews('u1', [dto, drill] as never)).toEqual([dto]);
    expect(sqlOf(0)).toContain('unnest(');
    expect(sqlOf(0)).toContain('where practice_reviews.last_reviewed_at <= excluded.last_reviewed_at');
    expect(paramsOf(0)).toEqual([
      'u1',
      ['problem', 'drill'],
      ['two-sum', 'valid-anagram'],
      [1, 1],
      [dto.dueAt, dto.dueAt],
      [dto.lastReviewedAt, dto.lastReviewedAt],
      [2, 2],
    ]);
    expect(sqlOf(1)).toContain('from practice_reviews where user_sub = $1');
  });
});
