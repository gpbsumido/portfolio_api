import { pool } from '../../config/database.js';
import type { AdjustmentInput, AdjustmentRow, AdjustmentStatus } from './adjustments.types.js';

/** Rows for the approval UI, newest batch first; optionally filtered by status. */
export async function listAdjustments(status: AdjustmentStatus | 'all'): Promise<AdjustmentRow[]> {
  if (status === 'all') {
    const { rows } = await pool.query<AdjustmentRow>(
      `SELECT * FROM draft_adjustments ORDER BY batch_date DESC, created_at DESC`,
    );
    return rows;
  }
  const { rows } = await pool.query<AdjustmentRow>(
    `SELECT * FROM draft_adjustments WHERE status = $1 ORDER BY batch_date DESC, created_at DESC`,
    [status],
  );
  return rows;
}

/** Approve/reject one row. Returns the updated row, or null if the id is unknown. */
export async function setStatus(id: string, status: 'approved' | 'rejected'): Promise<AdjustmentRow | null> {
  const { rows } = await pool.query<AdjustmentRow>(
    `UPDATE draft_adjustments SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, status],
  );
  return rows[0] ?? null;
}

/**
 * Upsert a daily batch. Re-running the same day updates the fact (note, delta,
 * source) in place on the dedup key but LEAVES status untouched, so an approval
 * Paul already made is never silently reverted by a refresh.
 */
export async function upsertBatch(batchDate: string, items: AdjustmentInput[]): Promise<number> {
  let n = 0;
  for (const it of items) {
    await pool.query(
      `INSERT INTO draft_adjustments
         (player_name, team, position, category, note, source_url, delta_pct, beneficiary_of, confidence, batch_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (player_name, category, batch_date) DO UPDATE SET
         team = EXCLUDED.team, position = EXCLUDED.position, note = EXCLUDED.note,
         source_url = EXCLUDED.source_url, delta_pct = EXCLUDED.delta_pct,
         beneficiary_of = EXCLUDED.beneficiary_of, confidence = EXCLUDED.confidence,
         updated_at = NOW()`,
      [it.player, it.team ?? null, it.position ?? null, it.category, it.note,
        it.sourceUrl ?? null, it.deltaPct, it.beneficiaryOf ?? null, it.confidence, batchDate],
    );
    n++;
  }
  return n;
}
