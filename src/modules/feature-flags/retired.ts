// ---------------------------------------------------------------------------
// Flags that have been retired, kept only so their migrations stay runnable.
//
// A migration runs against fresh databases forever (CI builds one on every
// run), so it can't read its row from CANONICAL_FLAGS once the flag has left
// the seed. The definition is frozen here instead.
// ---------------------------------------------------------------------------

import type { EnvironmentConfig, Flag, RolloutWeight } from './types.js';

const off: RolloutWeight = { variation: 'off', weight: 100 };
const on: RolloutWeight = { variation: 'on', weight: 100 };

const boolEnv = (fallthrough: RolloutWeight[]): EnvironmentConfig => ({
  enabled: true,
  offVariation: 'off',
  rules: [],
  fallthrough,
});

/**
 * work-portfolio-remote, as migration 046 created it: on in development and
 * staging, 0% in production. It gated /work-portfolio between paul-explore's
 * in-repo copy and the micro-frontend remote until the remote was serving
 * everyone; migration 047 removes it.
 */
export const WORK_PORTFOLIO_REMOTE_FLAG: Flag = {
  key: 'work-portfolio-remote',
  access: 'admin',
  name: 'Work portfolio remote',
  description:
    'Serves /work-portfolio from the micro-frontend remote (gpbsumido/work-portfolio-mfe) instead of the in-repo copy. Sticky per visitor, and paul-explore fails closed: a missing flag means the in-repo page. Created at 0% in production; dial it up to migrate, and down to roll back without a deploy.',
  kind: 'boolean',
  tags: ['work-portfolio', 'micro-frontend', 'migration'],
  variations: [
    { key: 'on', name: 'Enabled', value: true },
    { key: 'off', name: 'Disabled', value: false },
  ],
  createdAt: '2026-09-30T12:00:00.000Z',
  environments: {
    development: boolEnv([on]),
    staging: boolEnv([on]),
    production: boolEnv([{ variation: 'on', weight: 0 }, off]),
  },
};

/** The same flag at the rollout it was retired at: 100% everywhere. */
export const WORK_PORTFOLIO_REMOTE_FLAG_AT_RETIREMENT: Flag = {
  ...WORK_PORTFOLIO_REMOTE_FLAG,
  environments: {
    development: boolEnv([on]),
    staging: boolEnv([on]),
    production: boolEnv([on]),
  },
};
