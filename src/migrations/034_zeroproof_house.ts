import type { Knex } from 'knex';

/**
 * ZeroProof revenue plumbing: attributed referral clicks, and house-level ledger
 * entries (yield) that aren't tied to a wallet.
 *
 * `ledger_entries.wallet_id` relaxes to nullable so a yield accrual — which
 * belongs to the house/escrow float, not any one wallet — lives in the same
 * ledger as everything else, keeping "house" a single derivable account.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('zeroproof_ledger_entries', (t) => {
    t.uuid('wallet_id').nullable().alter();
  });

  await knex.schema.createTable('zeroproof_referral_clicks', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    // Nullable: a click can be anonymous, though the point is attribution.
    t.text('user_sub');
    t.text('partner').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['partner', 'created_at'], 'zeroproof_referral_clicks_partner_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('zeroproof_referral_clicks');
  // Best-effort restore; fails if house-level (null wallet_id) rows exist.
  await knex.schema.alterTable('zeroproof_ledger_entries', (t) => {
    t.uuid('wallet_id').notNullable().alter();
  });
}
