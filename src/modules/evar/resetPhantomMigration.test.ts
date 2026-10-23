import { describe, expect, test, vi } from 'vitest';
import type { Knex } from 'knex';

import { up, down } from '../../migrations/051_evar_reset_phantom_v1.js';

/**
 * Lives here rather than beside the migration because knex loads every `.ts`
 * file in `src/migrations` as a migration, tests included.
 */

/** A stand-in for knex that records which tables had their rows deleted. */
function fakeKnex() {
  const emptied: string[] = [];
  const knex = vi.fn((table: string) => ({
    del: vi.fn(async () => {
      emptied.push(table);
      return 0;
    }),
  }));
  return { knex: knex as unknown as Knex, emptied };
}

describe('migration 051: reset the EVAR study for the reworked phantom', () => {
  test('deletes every recorded attempt and every hand-set reference', async () => {
    const { knex, emptied } = fakeKnex();
    await up(knex);
    expect([...emptied].sort()).toEqual(['evar_attempts', 'evar_case_references']);
  });

  test('keeps participants, whose consent has nothing to do with the anatomy', async () => {
    const { knex, emptied } = fakeKnex();
    await up(knex);
    expect(emptied).not.toContain('evar_participants');
  });

  test('has nothing to put back on the way down', async () => {
    const { knex, emptied } = fakeKnex();
    await down(knex);
    expect(emptied).toEqual([]);
  });
});
