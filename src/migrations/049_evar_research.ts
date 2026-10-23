import type { Knex } from 'knex';

/**
 * EVAR sizing practice: who opted in to the research study, and every attempt
 * they made after opting in.
 *
 * Participants are keyed by Auth0 subject with no FK to `users`, the same as
 * check-in, so joining doesn't depend on a social profile existing. The sub is
 * how the API finds your own row and nothing else: exports go out under the
 * participant's uuid, never the sub or an email.
 *
 * Withdrawing deletes the participant, and the cascade takes every attempt
 * with it. There is no soft delete on purpose: "delete my data" should mean it.
 *
 * Attempts keep the raw measurements and the app version next to the scores
 * the client worked out, so they can be re-scored if a reference or a
 * tolerance changes later.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('evar_participants', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('auth_sub').notNullable().unique();
    t.text('consent_version').notNullable();
    t.timestamp('consented_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.text('training_level').notNullable();
    t.integer('training_year');
    t.text('specialty');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('evar_attempts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('participant_id').notNullable().references('id').inTable('evar_participants').onDelete('CASCADE');
    // Made in the browser before the first send, so a retry after a dropped
    // response lands on the same row instead of recording the attempt twice.
    t.uuid('client_attempt_id').notNullable().unique();
    t.text('case_id').notNullable();
    t.text('level').notNullable();
    t.text('app_version').notNullable();
    t.timestamp('started_at', { useTz: true }).notNullable();
    t.timestamp('submitted_at', { useTz: true }).notNullable();
    t.integer('duration_ms').notNullable();
    t.integer('time_limit_ms');
    t.boolean('timed_out').notNullable().defaultTo(false);
    t.jsonb('measurements').notNullable();
    t.jsonb('scores').notNullable();
    t.jsonb('devices');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['participant_id', 'submitted_at'], 'evar_attempts_participant_submitted_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('evar_attempts');
  await knex.schema.dropTableIfExists('evar_participants');
}
