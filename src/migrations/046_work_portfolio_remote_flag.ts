/**
 * Migration: the work-portfolio-remote live gate
 *
 * paul-explore serves /work-portfolio from either its in-repo copy or the
 * micro-frontend remote, per visitor, on this flag. It only existed in
 * paul-explore's local seed, so the console (which reads this API) had
 * nothing to ramp.
 *
 * Inserted once and never overwritten, the same way 019 added the first two
 * live gates: if a row is already there, whatever rollout it is at is someone's
 * deliberate choice. Created at 0% in production, so this moves no one.
 */

import type { Knex } from 'knex';

// Read from the frozen definition, not CANONICAL_FLAGS: the flag has since
// been retired (047), and this still has to run on a fresh database.
import { WORK_PORTFOLIO_REMOTE_FLAG as flag } from '../modules/feature-flags/retired.js';

export async function up(knex: Knex): Promise<void> {
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

export async function down(knex: Knex): Promise<void> {
  await knex('feature_flags').where({ key: flag.key }).del();
}
