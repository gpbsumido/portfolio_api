import { pool } from '../../config/database.js';
import type {
  AttemptInput,
  ParticipantInput,
  ReferenceInput,
  ReportInput,
  ReportListStatus,
  ReportUpdateInput,
} from './schemas.js';
import type {
  EvarAttemptRow,
  EvarCaseReferenceRow,
  EvarParticipantRow,
  EvarScanReportRow,
  RecordAttemptResult,
} from './types.js';

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

/** Every admin-set answer, by case. */
export async function listReferences(): Promise<EvarCaseReferenceRow[]> {
  const { rows } = await pool.query<EvarCaseReferenceRow>('SELECT * FROM evar_case_references ORDER BY case_id');
  return rows;
}

/** Adds or replaces a case's answers. */
export async function upsertReference(
  caseId: string,
  input: ReferenceInput,
  actor: string | null,
): Promise<EvarCaseReferenceRow> {
  const { rows } = await pool.query<EvarCaseReferenceRow>(
    `INSERT INTO evar_case_references
       (case_id, neck_diameter, neck_length, max_sac, right_cia, left_cia, note, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (case_id) DO UPDATE SET
       neck_diameter = EXCLUDED.neck_diameter,
       neck_length = EXCLUDED.neck_length,
       max_sac = EXCLUDED.max_sac,
       right_cia = EXCLUDED.right_cia,
       left_cia = EXCLUDED.left_cia,
       note = EXCLUDED.note,
       updated_by = EXCLUDED.updated_by,
       updated_at = now()
     RETURNING *`,
    [caseId, input.neckDiameter, input.neckLength, input.maxSac, input.rightCia, input.leftCia, input.note ?? null, actor],
  );
  return rows[0];
}

/** Drops an override, so the case goes back to its built-in answers. */
export async function deleteReference(caseId: string): Promise<boolean> {
  const { rowCount } = await pool.query('DELETE FROM evar_case_references WHERE case_id = $1', [caseId]);
  return (rowCount ?? 0) > 0;
}

/** Files a report against the caller. It starts open. */
export async function createReport(sub: string, input: ReportInput): Promise<EvarScanReportRow> {
  const { rows } = await pool.query<EvarScanReportRow>(
    `INSERT INTO evar_scan_reports (reporter_sub, case_id, slice, kind, message)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [sub, input.caseId, input.slice ?? null, input.kind, input.message],
  );
  return rows[0];
}

/** The caller's own reports, newest first. */
export async function listReportsFor(sub: string, limit: number): Promise<EvarScanReportRow[]> {
  const { rows } = await pool.query<EvarScanReportRow>(
    'SELECT * FROM evar_scan_reports WHERE reporter_sub = $1 ORDER BY created_at DESC LIMIT $2',
    [sub, limit],
  );
  return rows;
}

/** The admin queue, oldest first so the ones waiting longest are on top. */
export async function listReports(status: ReportListStatus): Promise<EvarScanReportRow[]> {
  const { rows } = await pool.query<EvarScanReportRow>(
    `SELECT * FROM evar_scan_reports
     WHERE $1 = 'all' OR status = $1
     ORDER BY created_at ASC`,
    [status],
  );
  return rows;
}

/**
 * Marks a report fixed or reopens it, and records who did.
 *
 * Fixed stamps when and by whom; reopening clears both, so the row never
 * says "handled" about something that's open again. The note is only touched
 * when the update carries one: `$3` says whether it did, so `null` can mean
 * "clear it" and absent can mean "leave it".
 */
export async function updateReport(
  id: string,
  input: ReportUpdateInput,
  adminEmail: string | null,
): Promise<EvarScanReportRow | null> {
  const { rows } = await pool.query<EvarScanReportRow>(
    `UPDATE evar_scan_reports SET
       status = $2,
       admin_note = CASE WHEN $3 THEN $4 ELSE admin_note END,
       handled_by = CASE WHEN $2 = 'fixed' THEN $5 ELSE NULL END,
       handled_at = CASE WHEN $2 = 'fixed' THEN now() ELSE NULL END,
       updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, input.status, input.adminNote !== undefined, input.adminNote ?? null, adminEmail],
  );
  return rows[0] ?? null;
}
