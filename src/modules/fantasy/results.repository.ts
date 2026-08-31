import { pool } from '../../config/database.js';
import type { ResultInput, ResultRow } from './results.types.js';

/**
 * Upsert one finished draft. Idempotent on (client_key, client_draft_id): a tab
 * re-render that re-sends the same completed draft UPDATEs the one row instead
 * of piling up duplicates. Returns the row id.
 */
export async function upsertResult(clientKey: string, input: ResultInput): Promise<{ id: string }> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO draft_results
       (client_key, client_draft_id, sport, num_teams, rounds, my_slot, mode,
        fully_sim, human_pick_count, team_names, picks, standings)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (client_key, client_draft_id) DO UPDATE SET
       sport = EXCLUDED.sport, num_teams = EXCLUDED.num_teams, rounds = EXCLUDED.rounds,
       my_slot = EXCLUDED.my_slot, mode = EXCLUDED.mode, fully_sim = EXCLUDED.fully_sim,
       human_pick_count = EXCLUDED.human_pick_count, team_names = EXCLUDED.team_names,
       picks = EXCLUDED.picks, standings = EXCLUDED.standings, updated_at = NOW()
     RETURNING id`,
    [
      clientKey, input.clientDraftId, input.sport, input.numTeams, input.rounds,
      input.mySlot, input.mode, input.fullySim, input.humanPickCount, input.teamNames,
      JSON.stringify(input.picks), JSON.stringify(input.standings),
    ],
  );
  return rows[0];
}

/**
 * Recent finished drafts, newest first. Summary columns by default; `full`
 * adds the picks + standings blobs for the download-everything export.
 */
export async function listResults(limit: number, full = false): Promise<ResultRow[]> {
  const cols = full
    ? '*'
    : `id, client_key, client_draft_id, sport, num_teams, rounds, my_slot,
       mode, fully_sim, human_pick_count, created_at`;
  const { rows } = await pool.query<ResultRow>(
    `SELECT ${cols} FROM draft_results ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows;
}
