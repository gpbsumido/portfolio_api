/**
 * Migration: reset the EVAR study for the reworked phantom
 *
 * paul-explore 7.26.0 gives every phantom neck a taper, an angle, thrombus or
 * calcium. The case ids stayed the same but every image changed, so an
 * attempt recorded against `hostile-neck` before this was measured on a
 * round, clean neck that no longer exists, and a hand-set reference for it
 * describes the same old geometry. Both go. Participants and their consent
 * stay: consent was never about the anatomy.
 *
 * Down can't bring the rows back, so it does nothing.
 */

import type { Knex } from 'knex';

// DESTRUCTIVE: deletes every evar_attempts and evar_case_references row. They describe anatomy that no longer exists, and the study has no ethics approval yet, so none of it was usable data.
export async function up(knex: Knex): Promise<void> {
  await knex('evar_attempts').del();
  await knex('evar_case_references').del();
}

export async function down(_knex: Knex): Promise<void> {
  // The deleted rows are gone for good.
}
