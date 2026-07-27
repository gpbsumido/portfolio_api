// ---------------------------------------------------------------------------
// Canonical feature-flag seed — the single source of truth for the demo data.
//
// Ported from paul-explore's in-memory `flags-data.ts` so the console looks
// identical when it reads from the API. BOTH the migration (initial seed) and
// the every-6-hours reset cron import this module, so the demo can never drift:
// there is exactly one definition of "the canonical 5 flags" and "the seed
// audit log".
// ---------------------------------------------------------------------------

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

/** The canonical five flags, in display order. */
export const CANONICAL_FLAGS: Flag[] = [
  {
    key: 'new-checkout',
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
];

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
