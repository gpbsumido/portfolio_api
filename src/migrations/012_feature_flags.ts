/**
 * Migration: feature_flags
 *
 * Backs the paul-explore feature-flags console with real persistence: one row
 * per flag (per-environment config as JSONB, mirroring the `Flag` contract 1:1)
 * plus an append-only audit log. Seeds the canonical five flags and the seed
 * audit entries so the console looks identical the moment it points here. The
 * every-6-hours reset cron re-applies the same canonical seed.
 */

import type { Knex } from 'knex';
import { CANONICAL_AUDIT, CANONICAL_FLAGS } from '../modules/feature-flags/seed.js';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('feature_flags', (t) => {
    t.text('key').primary();
    t.text('name').notNullable();
    t.text('description').notNullable();
    t.text('kind').notNullable();
    t.jsonb('tags').notNullable();
    t.jsonb('variations').notNullable();
    t.jsonb('environments').notNullable();
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('feature_flag_audit', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('flag_key').notNullable();
    t.text('environment').notNullable();
    t.text('action').notNullable();
    t.text('summary').notNullable();
    t.text('actor').notNullable();
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // Audit is served newest-first, so index the sort column descending.
  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_feature_flag_audit_created_at ON feature_flag_audit(created_at DESC)',
  );

  await seedFeatureFlags(knex);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('feature_flag_audit');
  await knex.schema.dropTableIfExists('feature_flags');
}

/**
 * Insert the canonical demo data. Exported so it stays a single definition; the
 * reset cron re-seeds through the same source (see modules/feature-flags/seed).
 * JSONB columns take a JSON string, which Postgres casts on insert.
 */
export async function seedFeatureFlags(knex: Knex): Promise<void> {
  await knex('feature_flags').insert(
    CANONICAL_FLAGS.map((flag) => ({
      key: flag.key,
      name: flag.name,
      description: flag.description,
      kind: flag.kind,
      tags: JSON.stringify(flag.tags),
      variations: JSON.stringify(flag.variations),
      environments: JSON.stringify(flag.environments),
      created_at: flag.createdAt,
    })),
  );

  await knex('feature_flag_audit').insert(
    CANONICAL_AUDIT.map((entry) => ({
      flag_key: entry.flagKey,
      environment: entry.environment,
      action: entry.action,
      summary: entry.summary,
      actor: entry.actor,
      created_at: entry.timestamp,
    })),
  );
}
