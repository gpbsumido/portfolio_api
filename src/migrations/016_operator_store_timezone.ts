/**
 * Migration: operator store timezone
 *
 * Every bucket boundary in the operator dashboard was UTC, so a Toronto store's
 * "day" actually started at 8pm the evening before and a Vancouver store's at
 * 5pm. Sales made in the busiest part of the afternoon were filed under the next
 * day. Fixing that needs to know where each store actually is.
 *
 * The column is nullable on purpose. `province` already gets the right zone for
 * the overwhelming majority of Canadian addresses, and the application derives
 * from it, so this is an override rather than the source of truth. It matters
 * because BC, QC and NU each span more than one zone -- NU spans three -- so a
 * province code alone can never be correct for every store. Backfilling from
 * province gives every existing row a sane value without a data-entry pass.
 */

import type { Knex } from 'knex';

/** Province -> the zone the overwhelming majority of that province observes. */
const PROVINCE_ZONE: Record<string, string> = {
  AB: 'America/Edmonton',
  BC: 'America/Vancouver',
  MB: 'America/Winnipeg',
  NB: 'America/Moncton',
  NL: 'America/St_Johns',
  NS: 'America/Halifax',
  NT: 'America/Yellowknife',
  NU: 'America/Iqaluit',
  ON: 'America/Toronto',
  PE: 'America/Halifax',
  QC: 'America/Toronto',
  SK: 'America/Regina',
  YT: 'America/Whitehorse',
};

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('operator_stores', (t) => {
    t.text('timezone').nullable();
  });

  for (const [province, zone] of Object.entries(PROVINCE_ZONE)) {
    await knex('operator_stores')
      .where({ province })
      .whereNull('timezone')
      .update({ timezone: zone });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('operator_stores', (t) => {
    t.dropColumn('timezone');
  });
}
