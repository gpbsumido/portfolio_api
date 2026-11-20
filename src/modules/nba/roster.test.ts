import { describe, test, expect, vi, afterEach } from 'vitest';
import { NbaRepository } from './repository.js';

const rosterResponse = (headers: string[], rows: unknown[][]) =>
  new Response(JSON.stringify({ resultSets: [{ headers, rowSet: rows }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

afterEach(() => vi.unstubAllGlobals());

describe('NBA team roster', () => {
  test('reads players from the columns it expects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        rosterResponse(
          ['TeamID', 'PLAYER', 'POSITION', 'HEIGHT', 'PLAYER_ID'],
          [[1610612744, 'Stephen Curry', 'G', '6-2', 201939]],
        ),
      ),
    );

    const roster = await new NbaRepository().fetchPlayersByTeam(1610612744, '2025-26');

    expect(roster.data).toEqual([
      expect.objectContaining({ id: 201939, first_name: 'Stephen', last_name: 'Curry', height_feet: 6 }),
    ]);
  });

  test('a renamed column fails loudly instead of returning an empty roster', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        rosterResponse(
          ['TeamID', 'PLAYER', 'POS', 'HEIGHT', 'PLAYER_ID'],
          [[1610612744, 'Stephen Curry', 'G', '6-2', 201939]],
        ),
      ),
    );

    await expect(new NbaRepository().fetchPlayersByTeam(1610612744, '2025-26')).rejects.toThrow(
      "Column 'POSITION' not found",
    );
  });
});
