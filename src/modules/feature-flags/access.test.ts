import { describe, expect, test } from 'vitest';
import { ACCESS_TIERS, isProtectedFlag } from './access.js';
import { CANONICAL_FLAGS, RESETTABLE_FLAGS } from './seed.js';

describe('flag access tiers', () => {
  test('every canonical flag declares a tier the console understands', () => {
    for (const flag of CANONICAL_FLAGS) {
      expect(ACCESS_TIERS).toContain(flag.access);
    }
  });

  test('the two live kill switches are admin-only', () => {
    // These gate real pages on paul-explore. Anything looser would hand a
    // stranger the switch for /tcg/pocket or world presence.
    const admin = CANONICAL_FLAGS.filter((f) => f.access === 'admin').map((f) => f.key);
    expect(admin).toEqual(['pocket-tcg', 'world-live-presence']);
  });

  test('the demo flags stay reachable without being admin', () => {
    const demo = CANONICAL_FLAGS.filter((f) => f.access !== 'admin');
    expect(demo.length).toBeGreaterThan(0);
    for (const flag of demo) {
      expect(['open', 'authed']).toContain(flag.access);
    }
  });
});

describe('isProtectedFlag', () => {
  test('protects the admin tier from the reset', () => {
    expect(isProtectedFlag('pocket-tcg')).toBe(true);
    expect(isProtectedFlag('world-live-presence')).toBe(true);
  });

  test('leaves the demo flags resettable', () => {
    expect(isProtectedFlag('dark-mode')).toBe(false);
    expect(isProtectedFlag('new-checkout')).toBe(false);
  });

  test('treats an unknown key as resettable, since only known live gates are protected', () => {
    expect(isProtectedFlag('something-else')).toBe(false);
  });
});

describe('RESETTABLE_FLAGS', () => {
  test('excludes every protected flag', () => {
    // The 6-hourly reset deletes and re-seeds. Sweeping a live kill switch
    // into that would turn a deliberate "off" back on within six hours, which
    // is the opposite of what a kill switch is for.
    const keys = RESETTABLE_FLAGS.map((f) => f.key);
    expect(keys).not.toContain('pocket-tcg');
    expect(keys).not.toContain('world-live-presence');
  });

  test('still covers all the demo flags', () => {
    const keys = RESETTABLE_FLAGS.map((f) => f.key);
    expect(keys).toContain('dark-mode');
    expect(keys).toContain('new-checkout');
    expect(RESETTABLE_FLAGS.length).toBe(CANONICAL_FLAGS.length - 2);
  });
});
