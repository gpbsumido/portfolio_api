// ---------------------------------------------------------------------------
// Canonical feature-flag seed — the single source of truth for the demo data.
//
// Ported from paul-explore's in-memory `flags-data.ts` so the console looks
// identical when it reads from the API. BOTH the migration (initial seed) and
// the every-6-hours reset cron import this module, so the demo can never drift:
// there is exactly one definition of "the canonical 5 flags" and "the seed
// audit log".
// ---------------------------------------------------------------------------

import { isProtectedFlag } from './access.js';
import type { AuditEntry, EnvironmentConfig, Flag, RolloutWeight } from './types.js';

const BOOLEAN: Flag['variations'] = [
  { key: 'on', name: 'Enabled', value: true },
  { key: 'off', name: 'Disabled', value: false },
];

/** Shorthand for the common on/off env config so the seed reads cleanly. */
function boolEnv(config: {
  enabled: boolean;
  rules?: EnvironmentConfig['rules'];
  fallthrough: RolloutWeight[];
}): EnvironmentConfig {
  return {
    enabled: config.enabled,
    offVariation: 'off',
    rules: config.rules ?? [],
    fallthrough: config.fallthrough,
  };
}

/** The canonical flags, in display order. */
export const CANONICAL_FLAGS: Flag[] = [
  {
    key: 'new-checkout',
    access: 'authed',
    name: 'New checkout flow',
    description:
      'Rebuilt checkout with saved cards and express pay. Rolling out gradually to watch conversion.',
    kind: 'boolean',
    tags: ['checkout', 'revenue'],
    variations: [...BOOLEAN],
    createdAt: '2026-05-02T14:00:00.000Z',
    environments: {
      development: boolEnv({
        enabled: true,
        fallthrough: [{ variation: 'on', weight: 100 }],
      }),
      staging: boolEnv({
        enabled: true,
        fallthrough: [{ variation: 'on', weight: 100 }],
      }),
      production: boolEnv({
        enabled: true,
        rules: [
          {
            id: 'nc-enterprise',
            description: 'Enterprise accounts get it first',
            clauses: [{ attribute: 'plan', op: 'in', values: ['enterprise'] }],
            serve: 'on',
          },
        ],
        fallthrough: [
          { variation: 'on', weight: 25 },
          { variation: 'off', weight: 75 },
        ],
      }),
    },
  },
  {
    key: 'ai-search',
    access: 'open',
    name: 'AI-powered search',
    description:
      'Semantic search backed by embeddings. Gated to beta users and internal accounts while we tune relevance.',
    kind: 'boolean',
    tags: ['search', 'ai', 'beta'],
    variations: [...BOOLEAN],
    createdAt: '2026-06-10T09:30:00.000Z',
    environments: {
      development: boolEnv({
        enabled: true,
        fallthrough: [{ variation: 'on', weight: 100 }],
      }),
      staging: boolEnv({
        enabled: true,
        rules: [
          {
            id: 'ais-beta',
            description: 'Opted-in beta testers',
            clauses: [{ attribute: 'beta', op: 'in', values: ['true'] }],
            serve: 'on',
          },
        ],
        fallthrough: [{ variation: 'off', weight: 100 }],
      }),
      production: boolEnv({
        enabled: true,
        rules: [
          {
            id: 'ais-internal',
            description: 'Internal @acme accounts',
            clauses: [{ attribute: 'email', op: 'endsWith', values: ['@acme.com'] }],
            serve: 'on',
          },
        ],
        fallthrough: [
          { variation: 'on', weight: 10 },
          { variation: 'off', weight: 90 },
        ],
      }),
    },
  },
  {
    key: 'checkout-experience',
    access: 'authed',
    name: 'Checkout experiment (A/B/C)',
    description:
      'Multivariate test of three checkout layouts. Traffic is split evenly and bucketing is sticky so a user always sees the same layout.',
    kind: 'multivariate',
    tags: ['checkout', 'experiment'],
    variations: [
      { key: 'control', name: 'Control', value: 'control' },
      { key: 'variant-a', name: 'Variant A - single page', value: 'variant-a' },
      { key: 'variant-b', name: 'Variant B - wizard', value: 'variant-b' },
    ],
    createdAt: '2026-06-22T11:00:00.000Z',
    environments: {
      development: {
        enabled: true,
        offVariation: 'control',
        rules: [],
        fallthrough: [
          { variation: 'control', weight: 34 },
          { variation: 'variant-a', weight: 33 },
          { variation: 'variant-b', weight: 33 },
        ],
      },
      staging: {
        enabled: true,
        offVariation: 'control',
        rules: [],
        fallthrough: [
          { variation: 'control', weight: 34 },
          { variation: 'variant-a', weight: 33 },
          { variation: 'variant-b', weight: 33 },
        ],
      },
      production: {
        enabled: false,
        offVariation: 'control',
        rules: [],
        fallthrough: [
          { variation: 'control', weight: 100 },
          { variation: 'variant-a', weight: 0 },
          { variation: 'variant-b', weight: 0 },
        ],
      },
    },
  },
  {
    key: 'priority-support',
    access: 'authed',
    name: 'Priority support queue',
    description:
      'Routes paid plans to the fast support queue. A pure targeting flag - no percentage rollout.',
    kind: 'boolean',
    tags: ['support', 'entitlement'],
    variations: [...BOOLEAN],
    createdAt: '2026-03-14T16:45:00.000Z',
    environments: {
      development: boolEnv({
        enabled: true,
        rules: [
          {
            id: 'ps-paid',
            description: 'Pro and enterprise plans',
            clauses: [{ attribute: 'plan', op: 'in', values: ['pro', 'enterprise'] }],
            serve: 'on',
          },
        ],
        fallthrough: [{ variation: 'off', weight: 100 }],
      }),
      staging: boolEnv({
        enabled: true,
        rules: [
          {
            id: 'ps-paid',
            description: 'Pro and enterprise plans',
            clauses: [{ attribute: 'plan', op: 'in', values: ['pro', 'enterprise'] }],
            serve: 'on',
          },
        ],
        fallthrough: [{ variation: 'off', weight: 100 }],
      }),
      production: boolEnv({
        enabled: true,
        rules: [
          {
            id: 'ps-paid',
            description: 'Pro and enterprise plans',
            clauses: [{ attribute: 'plan', op: 'in', values: ['pro', 'enterprise'] }],
            serve: 'on',
          },
        ],
        fallthrough: [{ variation: 'off', weight: 100 }],
      }),
    },
  },
  {
    key: 'dark-mode',
    access: 'open',
    name: 'Dark mode',
    description:
      'Fully launched. Kept as a flag so it can be killed instantly if a regression appears.',
    kind: 'boolean',
    tags: ['ui'],
    variations: [...BOOLEAN],
    createdAt: '2026-01-08T10:00:00.000Z',
    environments: {
      development: boolEnv({
        enabled: true,
        fallthrough: [{ variation: 'on', weight: 100 }],
      }),
      staging: boolEnv({
        enabled: true,
        fallthrough: [{ variation: 'on', weight: 100 }],
      }),
      production: boolEnv({
        enabled: true,
        fallthrough: [{ variation: 'on', weight: 100 }],
      }),
    },
  },
  // ── Live gates ─────────────────────────────────────────────────────────────
  // These two are not demo data. They gate real pages on paul-explore, which is
  // why they are admin-only and why the reset below leaves them alone. Seeded
  // fully on so creating them changes nothing for visitors.
  {
    key: 'pocket-tcg',
    access: 'admin',
    name: 'Pok\u00e9mon TCG Pocket',
    description:
      'Gates the /tcg/pocket page for real visitors, evaluated server-side on a sticky per-visitor key. Flip the kill switch or dial the rollout down and real people lose access, stuck to their bucket.',
    kind: 'boolean',
    tags: ['tcg', 'release'],
    variations: [...BOOLEAN],
    createdAt: '2026-07-27T12:00:00.000Z',
    environments: {
      development: boolEnv({
        enabled: true,
        fallthrough: [{ variation: 'on', weight: 100 }],
      }),
      staging: boolEnv({
        enabled: true,
        fallthrough: [{ variation: 'on', weight: 100 }],
      }),
      production: boolEnv({
        enabled: true,
        fallthrough: [{ variation: 'on', weight: 100 }],
      }),
    },
  },
  {
    key: 'world-live-presence',
    access: 'admin',
    name: 'World live presence',
    description:
      'Kill switch for live multiplayer presence on /world \u2014 other explorers rendered from realtime snapshots. Off means visitors walk the city alone and the ghost stroll takes back over.',
    kind: 'boolean',
    tags: ['world', 'release'],
    variations: [...BOOLEAN],
    createdAt: '2026-07-29T12:00:00.000Z',
    environments: {
      development: boolEnv({
        enabled: true,
        fallthrough: [{ variation: 'on', weight: 100 }],
      }),
      staging: boolEnv({
        enabled: true,
        fallthrough: [{ variation: 'on', weight: 100 }],
      }),
      production: boolEnv({
        enabled: true,
        fallthrough: [{ variation: 'on', weight: 100 }],
      }),
    },
  },
];

/**
 * The flags the 6-hourly reset is allowed to touch.
 *
 * The reset wipes both tables and re-seeds, which keeps the demo pristine. A
 * live kill switch must not be in that set: turning /tcg/pocket off after a
 * regression would revert on its own within six hours, at whatever time of
 * night the cron happens to run.
 */
export const RESETTABLE_FLAGS: Flag[] = CANONICAL_FLAGS.filter(
  (flag) => !isProtectedFlag(flag.key),
);

/**
 * The flags the reset must never overwrite, but must make sure exist.
 *
 * Excluding them from the wipe was only half the job. The migration that first
 * inserted them runs once, so if a row is ever lost -- an older reset that
 * still deleted everything, a restore, a hand-run DELETE -- nothing would put
 * it back, and the console's site-owner group would silently empty out while
 * the gate quietly fell back to the value compiled into paul-explore.
 *
 * So the reset inserts these if they are missing and leaves them completely
 * alone if they are not. Existence is guaranteed; state is never touched.
 */
export const PROTECTED_FLAGS: Flag[] = CANONICAL_FLAGS.filter((flag) => isProtectedFlag(flag.key));

/**
 * The canonical audit log, newest first. IDs are assigned by the database
 * (uuid), so only the content and timestamps are seeded here.
 */
export const CANONICAL_AUDIT: Omit<AuditEntry, 'id'>[] = [
  {
    flagKey: 'new-checkout',
    environment: 'production',
    action: 'rollout-changed',
    summary: 'Production rollout raised to 25% on',
    actor: 'paul@paul-explore.dev',
    timestamp: '2026-07-20T18:12:00.000Z',
  },
  {
    flagKey: 'ai-search',
    environment: 'production',
    action: 'enabled',
    summary: 'Enabled in production',
    actor: 'paul@paul-explore.dev',
    timestamp: '2026-07-18T14:05:00.000Z',
  },
  {
    flagKey: 'checkout-experience',
    environment: 'production',
    action: 'disabled',
    summary: 'Disabled in production pending staging results',
    actor: 'paul@paul-explore.dev',
    timestamp: '2026-07-15T09:41:00.000Z',
  },
];
