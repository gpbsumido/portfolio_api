/**
 * The fake field. Everything here is made up: six tracks circling a point, one
 * of which drops off the net for a while every minute, and an alert every
 * twenty seconds. Time goes in and the whole picture comes out, with no state,
 * so any server instance answers the same for the same clock.
 */

export type FieldOpsTrackKind = "vehicle" | "aircraft" | "vessel";
export type FieldOpsAlertSeverity = "critical" | "warning" | "info";

export type FieldOpsTrack = {
  id: string;
  callsign: string;
  kind: FieldOpsTrackKind;
  eastMeters: number;
  northMeters: number;
  altitudeMeters: number;
  headingDegrees: number;
  speedMetersPerSecond: number;
  /** When this position was reported. Older than now means the track went quiet. */
  lastReportedAtMs: number;
};

export type FieldOpsAlert = {
  id: string;
  trackId: string;
  severity: FieldOpsAlertSeverity;
  message: string;
  raisedAtMs: number;
};

export type FieldOpsSnapshot = {
  serverTimeMs: number;
  tracks: FieldOpsTrack[];
  alerts: FieldOpsAlert[];
};

type TrackPlan = {
  id: string;
  callsign: string;
  kind: FieldOpsTrackKind;
  centerEastMeters: number;
  centerNorthMeters: number;
  radiusMeters: number;
  secondsPerLap: number;
  startAngleRadians: number;
  altitudeMeters: number;
};

const TRACK_PLANS: TrackPlan[] = [
  { id: "t-alpha", callsign: "Alpha 1", kind: "vehicle", centerEastMeters: -300, centerNorthMeters: 200, radiusMeters: 250, secondsPerLap: 180, startAngleRadians: 0, altitudeMeters: 0 },
  { id: "t-bravo", callsign: "Bravo 2", kind: "vehicle", centerEastMeters: 400, centerNorthMeters: -150, radiusMeters: 180, secondsPerLap: 140, startAngleRadians: 2, altitudeMeters: 0 },
  { id: "t-charlie", callsign: "Charlie 3", kind: "vessel", centerEastMeters: 0, centerNorthMeters: -450, radiusMeters: 320, secondsPerLap: 260, startAngleRadians: 4, altitudeMeters: 0 },
  { id: "t-delta", callsign: "Delta 4", kind: "aircraft", centerEastMeters: 0, centerNorthMeters: 0, radiusMeters: 520, secondsPerLap: 90, startAngleRadians: 1, altitudeMeters: 300 },
  { id: "t-echo", callsign: "Echo 5", kind: "aircraft", centerEastMeters: 150, centerNorthMeters: 300, radiusMeters: 380, secondsPerLap: 120, startAngleRadians: 3, altitudeMeters: 450 },
  { id: "t-foxtrot", callsign: "Foxtrot 6", kind: "vehicle", centerEastMeters: -450, centerNorthMeters: -250, radiusMeters: 140, secondsPerLap: 100, startAngleRadians: 5, altitudeMeters: 0 },
];

const SHADOWED_TRACK_INDEX = 2;
const SHADOW_CYCLE_MS = 60_000;
const SHADOW_STARTS_AT_MS = 40_000;
const ALERT_WINDOW_MS = 20_000;
const ALERT_WINDOWS_KEPT = 3;

const ALERT_SEVERITY_BY_WINDOW: FieldOpsAlertSeverity[] = ["info", "warning", "critical"];
const ALERT_MESSAGE_BY_SEVERITY: Record<FieldOpsAlertSeverity, string> = {
  info: "Position report resumed",
  warning: "Left the planned corridor",
  critical: "No contact, last position held",
};

function trackAt(plan: TrackPlan, reportedAtMs: number, lastReportedAtMs: number): FieldOpsTrack {
  const angleRadians = plan.startAngleRadians + (reportedAtMs / 1000 / plan.secondsPerLap) * 2 * Math.PI;
  const speedMetersPerSecond = (2 * Math.PI * plan.radiusMeters) / plan.secondsPerLap;
  const headingRadians = angleRadians + Math.PI / 2;
  return {
    id: plan.id,
    callsign: plan.callsign,
    kind: plan.kind,
    eastMeters: plan.centerEastMeters + plan.radiusMeters * Math.cos(angleRadians),
    northMeters: plan.centerNorthMeters + plan.radiusMeters * Math.sin(angleRadians),
    altitudeMeters: plan.altitudeMeters,
    headingDegrees: (90 - (headingRadians * 180) / Math.PI + 720) % 360,
    speedMetersPerSecond,
    lastReportedAtMs,
  };
}

/** The whole fake picture at one moment. */
export function simulateFieldOps(nowMs: number): FieldOpsSnapshot {
  const wholeSecondMs = Math.floor(nowMs / 1000) * 1000;
  const phaseInShadowCycleMs = nowMs % SHADOW_CYCLE_MS;

  const tracks = TRACK_PLANS.map((plan, trackIndex) => {
    const isInRadioShadow =
      trackIndex === SHADOWED_TRACK_INDEX && phaseInShadowCycleMs >= SHADOW_STARTS_AT_MS;
    const reportedAtMs = isInRadioShadow
      ? nowMs - phaseInShadowCycleMs + SHADOW_STARTS_AT_MS
      : wholeSecondMs;
    return trackAt(plan, reportedAtMs, reportedAtMs);
  });

  const currentAlertWindow = Math.floor(nowMs / ALERT_WINDOW_MS);
  const alerts = Array.from({ length: ALERT_WINDOWS_KEPT }, (_, windowsAgo) => {
    const alertWindow = currentAlertWindow - windowsAgo;
    const severity = ALERT_SEVERITY_BY_WINDOW[alertWindow % ALERT_SEVERITY_BY_WINDOW.length];
    return {
      id: `alert-${alertWindow}`,
      trackId: tracks[alertWindow % tracks.length].id,
      severity,
      message: ALERT_MESSAGE_BY_SEVERITY[severity],
      raisedAtMs: alertWindow * ALERT_WINDOW_MS,
    };
  });

  return { serverTimeMs: nowMs, tracks, alerts };
}
