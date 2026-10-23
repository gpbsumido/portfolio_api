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
 * dropped and recreated with the same ON DELETE.
 *
 * The drop goes by the name Postgres actually has, not the one knex would
 * guess. Production's calendar_members and user_profiles predate knex: the
 * legacy SQL scripts made them with a bare REFERENCES, so their constraints are
 * `<table>_<column>_fkey`, and the baseline was marked as run rather than run.
 * `dropForeign` assumes `<table>_<column>_foreign`, which only exists on a
 * database built from the baseline, so CI and staging passed and the
 * production deploy of 5.28.0 died in this migration.
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

/** Every foreign key from `table.column` to users, under whatever name it has. */
async function foreignKeyNames(knex: Knex, table: string, column: string): Promise<string[]> {
  const { rows } = await knex.raw<{ rows: { conname: string }[] }>(
    `SELECT con.conname
       FROM pg_constraint con
       JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
      WHERE con.contype = 'f'
        AND con.conrelid = ?::regclass
        AND con.confrelid = 'users'::regclass
        AND att.attname = ?`,
    [table, column],
  );
  return rows.map((r) => r.conname);
}

async function recreateForeignKeys(knex: Knex, onUpdate?: 'CASCADE'): Promise<void> {
  for (const fk of FOREIGN_KEYS) {
    for (const name of await foreignKeyNames(knex, fk.table, fk.column)) {
      await knex.raw('ALTER TABLE ?? DROP CONSTRAINT ??', [fk.table, name]);
    }
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
