import type { Knex } from 'knex';

/**
 * ZeroProof money foundation: a wallet per locked deposit and the double-entry
 * ledger that tracks every movement against it.
 *
 * Wallets are scoped by `user_sub` (the Auth0 subject) with no FK to `users`,
 * matching the card_wallets / nba_playoff_brackets pattern. `ledger_entries`
 * carries a nullable `bet_id` with no FK — the `bets` table lands in a later
 * migration and settlement stamps that id on then. Balances are never stored;
 * they are derived from the ledger's `user`-account rows.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('zeroproof_wallets', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('user_sub').notNullable();
    // 'season' | 'challenge'
    t.text('mode').notNullable();
    // The locked deposit, refunded in full at lock_end regardless of record.
    t.integer('principal_cents').notNullable();
    t.timestamp('lock_start', { useTz: true }).notNullable();
    t.timestamp('lock_end', { useTz: true }).notNullable();
    // 'active' | 'busted' | 'refunded'
    t.text('status').notNullable().defaultTo('active');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['user_sub'], 'zeroproof_wallets_user_idx');
  });

  // One active wallet per mode per user — a Challenge retry can't run alongside
  // a live Challenge, and Season is single-term. Enforced in the DB so a race
  // can't slip two active wallets past the app-level check.
  await knex.raw(
    `CREATE UNIQUE INDEX zeroproof_wallets_one_active_per_mode
       ON zeroproof_wallets (user_sub, mode)
       WHERE status = 'active'`,
  );

  await knex.schema.createTable('zeroproof_ledger_entries', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('wallet_id').notNullable().references('id').inTable('zeroproof_wallets').onDelete('CASCADE');
    // Set at settlement once the bets table exists; no FK yet.
    t.uuid('bet_id');
    // 'deposit' | 'stake' | 'payout' | 'refund' | 'yield'
    t.text('kind').notNullable();
    // 'user' | 'house' | 'escrow'
    t.text('account').notNullable();
    t.bigInteger('amount_cents').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['wallet_id'], 'zeroproof_ledger_wallet_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('zeroproof_ledger_entries');
  await knex.schema.dropTableIfExists('zeroproof_wallets');
}
