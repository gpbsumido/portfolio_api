/**
 * Migration: retire the work-portfolio-remote gate
 *
 * The flag ran at 100% in production, and paul-explore now always mounts the
 * micro-frontend remote (no in-repo copy left to fall back to), so nothing
 * reads it. It leaves CANONICAL_FLAGS and the protected set in the same
 * change, and this deletes the row.
 *
 * Down puts it back at the rollout it was retired at, 100%, rather than the 0%
 * it was created with: rolling this back should restore the last real state.
 */

import type { Knex } from 'knex';

import { WORK_PORTFOLIO_REMOTE_FLAG_AT_RETIREMENT as flag } from '../modules/feature-flags/retired.js';

export async function up(knex: Knex): Promise<void> {
  await knex('feature_flags').where({ key: flag.key }).del();
}

export async function down(knex: Knex): Promise<void> {
  await knex('feature_flags')
    .insert({
      key: flag.key,
      access: flag.access,
      name: flag.name,
      description: flag.description,
      kind: flag.kind,
      tags: JSON.stringify(flag.tags),
      variations: JSON.stringify(flag.variations),
      environments: JSON.stringify(flag.environments),
      created_at: new Date(flag.createdAt),
    })
    .onConflict('key')
    .ignore();
}
