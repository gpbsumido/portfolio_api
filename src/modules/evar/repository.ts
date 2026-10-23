import { pool } from '../../config/database.js';
import type { AttemptInput, ParticipantInput } from './schemas.js';
import type { EvarAttemptRow, EvarParticipantRow, RecordAttemptResult } from './types.js';

/** The caller's participant row, or null if they haven't joined. */
export async function getParticipant(sub: string): Promise<EvarParticipantRow | null> {
  const { rows } = await pool.query<EvarParticipantRow>(
    'SELECT * FROM evar_participants WHERE auth_sub = $1',
    [sub],
  );
  return rows[0] ?? null;
}

/**
 * Joins, or updates the profile of someone already in.
 *
 * `consented_at` only moves when the consent version does, so editing your
 * training year doesn't look like consenting again, and agreeing to a new
 * version is recorded as its own moment.
 */
export async function upsertParticipant(sub: string, input: ParticipantInput): Promise<EvarParticipantRow> {
  const { rows } = await pool.query<EvarParticipantRow>(
    `INSERT INTO evar_participants (auth_sub, consent_version, training_level, training_year, specialty)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (auth_sub) DO UPDATE SET
       consented_at = CASE
         WHEN evar_participants.consent_version = EXCLUDED.consent_version THEN evar_participants.consented_at
         ELSE now()
       END,
       consent_version = EXCLUDED.consent_version,
       training_level = EXCLUDED.training_level,
       training_year = EXCLUDED.training_year,
       specialty = EXCLUDED.specialty,
       updated_at = now()
     RETURNING *`,
    [sub, input.consentVersion, input.trainingLevel, input.trainingYear ?? null, input.specialty ?? null],
  );
  return rows[0];
}

/** Withdraws: the participant goes, and the FK cascade takes their attempts. */
export async function deleteParticipant(sub: string): Promise<boolean> {
  const { rowCount } = await pool.query('DELETE FROM evar_participants WHERE auth_sub = $1', [sub]);
  return (rowCount ?? 0) > 0;
}

/**
 * Stores an attempt once.
 *
 * ON CONFLICT on the browser-made id turns a resend into a no-op, and the
 * follow-up SELECT is scoped to the participant so a guessed id can't read
 * someone else's attempt back.
 */
export async function recordAttempt(participantId: string, input: AttemptInput): Promise<RecordAttemptResult> {
  const { rows } = await pool.query<EvarAttemptRow>(
    `INSERT INTO evar_attempts (
       participant_id, client_attempt_id, case_id, level, app_version, started_at, submitted_at,
       duration_ms, time_limit_ms, timed_out, measurements, scores, devices
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (client_attempt_id) DO NOTHING
     RETURNING *`,
    [
      participantId,
      input.clientAttemptId,
      input.caseId,
      input.level,
      input.appVersion,
      input.startedAt,
      input.submittedAt,
      input.durationMs,
      input.timeLimitMs,
      input.timedOut,
      JSON.stringify(input.measurements),
      JSON.stringify(input.scores),
      input.devices === null ? null : JSON.stringify(input.devices),
    ],
  );
  if (rows[0]) return { status: 'recorded', attempt: rows[0] };

  const existing = await pool.query<EvarAttemptRow>(
    'SELECT * FROM evar_attempts WHERE client_attempt_id = $1 AND participant_id = $2',
    [input.clientAttemptId, participantId],
  );
  return { status: 'already', attempt: existing.rows[0] };
}

/** A participant's own attempts, newest first. */
export async function listAttempts(participantId: string, limit: number): Promise<EvarAttemptRow[]> {
  const { rows } = await pool.query<EvarAttemptRow>(
    `SELECT * FROM evar_attempts
      WHERE participant_id = $1
      ORDER BY submitted_at DESC
      LIMIT $2`,
    [participantId, limit],
  );
  return rows;
}

/** Everything, for the study. The controller decides which columns leave. */
export async function exportAll(): Promise<{ participants: EvarParticipantRow[]; attempts: EvarAttemptRow[] }> {
  const participants = await pool.query<EvarParticipantRow>('SELECT * FROM evar_participants ORDER BY consented_at');
  const attempts = await pool.query<EvarAttemptRow>('SELECT * FROM evar_attempts ORDER BY submitted_at');
  return { participants: participants.rows, attempts: attempts.rows };
}
