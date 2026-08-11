/**
 * Migration: feature-flag access tiers
 *
 * Adds the `access` column and seeds the two live gates.
 *
 * The console at paul-explore groups flags by who may change them, and until
 * now it inferred that from a map it kept locally — which disagreed with the
 * server the moment the two flag sets diverged. The API is the authority now.
 *
 * The two new rows, pocket-tcg and world-live-presence, gate real pages. They
 * existed only as constants committed in paul-explore, so they worked but could
 * not be managed from the console at all. Seeded fully on, matching the values
 * that were already compiled in, so creating them changes nothing for visitors.
 */

import type { Knex } from 'knex';

import { isProtectedFlag } from '../modules/feature-flags/access.js';
import { CANONICAL_FLAGS } from '../modules/feature-flags/seed.js';

export async function up(knex: Knex): Promise<void> {
  // Default 'open' keeps any pre-existing row valid; the backfill below makes
  // every canonical flag explicit.
  await knex.schema.alterTable('feature_flags', (t) => {
    t.text('access').notNullable().defaultTo('open');
  });

  for (const flag of CANONICAL_FLAGS) {
    if (isProtectedFlag(flag.key)) {
      // The live gates have never existed as rows. Insert them; if a previous
      // run already did, leave whatever state they are in alone rather than
      // resetting a kill switch someone may have deliberately flipped.
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
      continue;
    }

    await knex('feature_flags').where({ key: flag.key }).update({ access: flag.access });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex('feature_flags')
    .whereIn(
      'key',
      CANONICAL_FLAGS.filter((f) => isProtectedFlag(f.key)).map((f) => f.key),
    )
    .del();

  await knex.schema.alterTable('feature_flags', (t) => {
    t.dropColumn('access');
  });
}
