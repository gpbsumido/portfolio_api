import type { Knex } from 'knex';

/**
 * Finished-draft records from the Draft Lab extension. Every copy of the
 * companion posts its completed drafts here with a self-minted client key
 * (throttled per key + IP at the route). Each row carries the full pick log with
 * a per-pick source (user | sim | keeper | espn), so a row shows exactly which
 * picks the human made versus which were simulated, plus the controlled team,
 * the fully-sim flag, and the final standings/grades.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('draft_results', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('client_key').notNullable(); // self-minted per-install UUID
    t.text('client_draft_id').notNullable(); // stable per draft, for idempotency
    t.text('sport').notNullable();
    t.integer('num_teams').notNullable();
    t.integer('rounds').notNullable();
    t.integer('my_slot').notNullable(); // the team the user controls
    t.text('mode').notNullable(); // practice | companion
    t.boolean('fully_sim').notNullable();
    t.integer('human_pick_count').notNullable();
    t.text('team_names'); // pipe-joined
    t.jsonb('picks').notNullable(); // [{overall,teamIdx,playerId,name,pos,source,keeper}]
    t.jsonb('standings').notNullable(); // {rows:[{teamIdx,starterPts}], myRank}
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // One row per (install, draft): a re-send of the same finished draft upserts.
    t.unique(['client_key', 'client_draft_id'], { indexName: 'draft_results_dedup' });
    // The read path lists recent drafts newest-first.
    t.index(['created_at'], 'draft_results_created_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('draft_results');
}
