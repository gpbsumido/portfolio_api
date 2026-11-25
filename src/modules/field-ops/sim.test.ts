import { describe, it, expect } from 'vitest';
import { simulateFieldOps } from './sim.js';

describe('simulateFieldOps', () => {
  it('gives the same answer for the same time, so any server instance agrees', () => {
    expect(simulateFieldOps(1_000_000)).toEqual(simulateFieldOps(1_000_000));
  });

  it('moves tracks as time passes', () => {
    const earlier = simulateFieldOps(1_000_000).tracks[0];
    const later = simulateFieldOps(1_030_000).tracks[0];
    expect([later.eastMeters, later.northMeters]).not.toEqual([
      earlier.eastMeters,
      earlier.northMeters,
    ]);
  });

  it('goes quiet on a track now and then, like a radio shadow, so the console has stale data to handle', () => {
    const seenWithOldReport = Array.from({ length: 120 }, (_, secondIndex) =>
      simulateFieldOps(secondIndex * 1000 + 1_000_000),
    ).some(({ tracks, serverTimeMs }) =>
      tracks.some((track) => serverTimeMs - track.lastReportedAtMs > 10_000),
    );
    expect(seenWithOldReport).toBe(true);
  });

  it('raises alerts that point at a real track', () => {
    const { tracks, alerts } = simulateFieldOps(1_000_000);
    expect(alerts.length).toBeGreaterThan(0);
    for (const alert of alerts) {
      expect(tracks.map((track) => track.id)).toContain(alert.trackId);
    }
  });
});
