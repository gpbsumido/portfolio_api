/** Someone who opted in to the EVAR research study. */
export interface EvarParticipantRow {
  id: string;
  auth_sub: string;
  consent_version: string;
  consented_at: string;
  training_level: string;
  training_year: number | null;
  specialty: string | null;
  created_at: string;
  updated_at: string;
}

/** One practice attempt, recorded after consent. */
export interface EvarAttemptRow {
  id: string;
  participant_id: string;
  client_attempt_id: string;
  case_id: string;
  level: string;
  app_version: string;
  started_at: string;
  submitted_at: string;
  duration_ms: number;
  time_limit_ms: number | null;
  timed_out: boolean;
  measurements: unknown;
  scores: unknown;
  devices: unknown;
  created_at: string;
}

/** Admin-set answers for one case, overriding what its geometry gives. */
export interface EvarCaseReferenceRow {
  case_id: string;
  neck_diameter: number;
  neck_length: number;
  max_sac: number;
  right_cia: number;
  left_cia: number;
  note: string | null;
  updated_by: string | null;
  updated_at: string;
}

/** `already` is a resend of an attempt that was stored the first time. */
export type RecordAttemptResult =
  | { status: 'recorded'; attempt: EvarAttemptRow }
  | { status: 'already'; attempt: EvarAttemptRow };

/** A mistake someone reported in a scan, and whether an admin has dealt with it. */
export interface EvarScanReportRow {
  id: string;
  reporter_sub: string;
  case_id: string;
  slice: number | null;
  kind: 'missing-slices' | 'wrong-answers' | 'image' | 'other';
  message: string;
  status: 'open' | 'fixed';
  admin_note: string | null;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
  updated_at: string;
}
