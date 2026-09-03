import type { Knex } from 'knex';

/**
 * ZeroProof events and the odds snapshots taken against them.
 *
 * `provider_key` maps a vendor's event id to our uuid, so a provider swap keeps
 * bet history intact. Every odds pull writes a snapshot row rather than
 * overwriting, so dev/test can replay a slate for free and the closing-line
 * capture (a later slice) has a full history to read from.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('zeroproof_events', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('provider_key').notNullable().unique();
    t.text('sport').notNullable();
    t.text('home').notNullable();
    t.text('away').notNullable();
    t.timestamp('commence_time', { useTz: true }).notNullable();
    // 'upcoming' | 'live' | 'final'
    t.text('status').notNullable().defaultTo('upcoming');
    // The final result, filled in at settlement; null until then.
    t.jsonb('result');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // The events feed reads upcoming games in kickoff order.
    t.index(['status', 'commence_time'], 'zeroproof_events_status_commence_idx');
  });

  await knex.schema.createTable('zeroproof_odds_snapshots', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('event_id').notNullable().references('id').inTable('zeroproof_events').onDelete('CASCADE');
    // 'h2h' | 'spread' | 'total'
    t.text('market').notNullable();
    t.jsonb('outcomes').notNullable();
    t.timestamp('fetched_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Latest-line reads scan by event + market, newest first.
    t.index(['event_id', 'market', 'fetched_at'], 'zeroproof_snapshots_event_market_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('zeroproof_odds_snapshots');
  await knex.schema.dropTableIfExists('zeroproof_events');
}
