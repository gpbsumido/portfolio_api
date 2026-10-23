/**
 * Migration: let a user's sub change without orphaning what points at it
 *
 * Auth0 now links logins that share a verified email into one user (the
 * post-login Action in paul-explore), so an email can move from one sub to
 * another. upsertUser hands the email's users row to the sub that logs in, and
 * every foreign key on users.sub cascades the change, so calendar memberships,
 * budgets and the profile move with the row instead of blocking the update.
 *
 * Postgres can't add ON UPDATE to an existing constraint, so each one is
 * dropped and recreated under the same name with the same ON DELETE.
 */

// DESTRUCTIVE: drops and recreates each foreign key on users.sub to add ON UPDATE CASCADE; no column, row or ON DELETE behaviour changes.

import type { Knex } from 'knex';

const FOREIGN_KEYS = [
  { table: 'calendar_members', column: 'user_sub', onDelete: 'CASCADE' },
  { table: 'calendar_members', column: 'invited_by', onDelete: 'SET NULL' },
  { table: 'user_profiles', column: 'user_sub', onDelete: 'CASCADE' },
  { table: 'budgets', column: 'owner_sub', onDelete: 'CASCADE' },
  { table: 'budget_people', column: 'user_sub', onDelete: 'SET NULL' },
  { table: 'budget_members', column: 'user_sub', onDelete: 'CASCADE' },
  { table: 'budget_join_requests', column: 'requester_sub', onDelete: 'CASCADE' },
] as const;

async function recreateForeignKeys(knex: Knex, onUpdate?: 'CASCADE'): Promise<void> {
  for (const fk of FOREIGN_KEYS) {
    await knex.schema.alterTable(fk.table, (t) => {
      t.dropForeign([fk.column]);
    });
    await knex.schema.alterTable(fk.table, (t) => {
      const ref = t.foreign(fk.column).references('sub').inTable('users').onDelete(fk.onDelete);
      if (onUpdate) ref.onUpdate(onUpdate);
    });
  }
}

export async function up(knex: Knex): Promise<void> {
  await recreateForeignKeys(knex, 'CASCADE');
}

export async function down(knex: Knex): Promise<void> {
  await recreateForeignKeys(knex);
}
