/** A location volunteers check in at. */
export interface CheckinSiteRow {
  id: string;
  owner_sub: string;
  name: string;
  code_salt: string;
  period_seconds: number;
  created_at: string;
  archived_at: string | null;
}

/** One recorded arrival. */
export interface CheckinArrivalRow {
  id: string;
  site_id: string;
  volunteer_sub: string;
  volunteer_email: string | null;
  window_start: string | number;
  created_at: string;
}

/** What the site owner's display needs to render. */
export interface SiteCode {
  code: string;
  secondsRemaining: number;
  periodSeconds: number;
}

/**
 * The outcome of a check-in attempt.
 *
 * `already` distinguishes a duplicate submit from a fresh arrival so the UI can
 * say "you're already checked in" rather than implying a second arrival was
 * recorded.
 */
export type CheckinResult =
  | { status: 'recorded'; arrival: CheckinArrivalRow }
  | { status: 'already'; arrival: CheckinArrivalRow };
