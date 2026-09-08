import type { Knex } from 'knex';

/**
 * ZeroProof leagues: user-run contests. A commissioner sets the rules
 * (starting bankroll, size, how you win) and players join. Scoped by `user_sub`
 * with no FK to `users`, matching the rest of the module. Bankrolls are
 * simulated — there is no locked deposit here, unlike season/challenge wallets.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('zeroproof_leagues', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('commissioner_sub').notNullable();
    t.text('name').notNullable();
    // Opaque code to join an invite-only league.
    t.text('join_code').notNullable().unique();
    // 'public' | 'invite'
    t.text('visibility').notNullable();
    t.integer('starting_bankroll_cents').notNullable();
    t.integer('max_members').notNullable();
    // 'threshold' | 'timeline'
    t.text('win_condition').notNullable();
    // Set for a threshold league: first member to reach it wins.
    t.bigInteger('threshold_cents');
    // Set for a timeline league: highest balance at this moment wins.
    t.timestamp('ends_at', { useTz: true });
    // 'open' | 'settled'
    t.text('status').notNullable().defaultTo('open');
    t.text('winner_sub');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('settled_at', { useTz: true });

    // Discovery lists public, open leagues.
    t.index(['visibility', 'status'], 'zeroproof_leagues_discovery_idx');
    t.index(['commissioner_sub'], 'zeroproof_leagues_commissioner_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('zeroproof_leagues');
}
