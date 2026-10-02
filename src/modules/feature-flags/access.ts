// ---------------------------------------------------------------------------
// Feature-flag access tiers.
//
// The console at paul-explore/flags is doing two jobs at once: most of it is a
// playground meant to be touched by whoever wanders in, and part of it is a
// live kill switch for a shipped page. One rule across both makes either the
// playground useless or the switch reckless, so there are three rungs.
//
// The API is the authority. paul-explore infers a tier from a local map when
// this field is absent, which was only ever a stand-in for the API carrying it
// — and that stand-in disagreed with the server the moment the two flag sets
// diverged. Serving `access` here retires it.
// ---------------------------------------------------------------------------

/** The three rungs, loosest first. */
export const ACCESS_TIERS = ['open', 'authed', 'admin'] as const;

export type FlagAccess = (typeof ACCESS_TIERS)[number];

/**
 * Flags that gate a real, shipped feature.
 *
 * These are excluded from the 6-hourly reset. The reset deletes every flag and
 * re-seeds from the canonical list, which is right for demo data and wrong for
 * a kill switch: turning /tcg/pocket off after a regression would silently
 * revert within six hours, exactly when nobody is watching.
 */
export const PROTECTED_FLAG_KEYS = ['pocket-tcg', 'world-live-presence'] as const;

/** Whether the reset must leave this flag alone. */
export function isProtectedFlag(key: string): boolean {
  return (PROTECTED_FLAG_KEYS as readonly string[]).includes(key);
}
