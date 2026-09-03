import type { Knex } from 'knex';

/**
 * ZeroProof bets. Odds are copied onto the bet at placement (`odds_american`,
 * plus `line_value` for spread/total), so a later line move never changes a
 * bet. `closing_odds_american` and `clv` are the moat — filled at settlement
 * from the closing snapshot, unrecoverable if not captured, so the columns
 * exist from the first bet even though a later slice populates them.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('zeroproof_bets', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('wallet_id').notNullable().references('id').inTable('zeroproof_wallets').onDelete('CASCADE');
    t.uuid('event_id').notNullable().references('id').inTable('zeroproof_events').onDelete('CASCADE');
    // 'h2h' | 'spread' | 'total'
    t.text('market').notNullable();
    t.text('selection').notNullable();
    // Locked at placement.
    t.integer('odds_american').notNullable();
    // The handicap at placement for spread/total; null for h2h.
    t.decimal('line_value');
    // The moat: line at kickoff and closing-line value, stamped at settlement.
    t.integer('closing_odds_american');
    t.decimal('clv');
    t.bigInteger('stake_cents').notNullable();
    // 'open' | 'won' | 'lost' | 'push' | 'void'
    t.text('status').notNullable().defaultTo('open');
    t.timestamp('placed_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('settled_at', { useTz: true });

    // A wallet reads its bets newest-first; the settler scans open bets by event.
    t.index(['wallet_id', 'placed_at'], 'zeroproof_bets_wallet_placed_idx');
    t.index(['event_id', 'status'], 'zeroproof_bets_event_status_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('zeroproof_bets');
}
