import type { Knex } from 'knex';

/**
 * Mistakes people spot in an EVAR scan, and what became of them.
 *
 * A report is keyed to the Auth0 subject of whoever filed it, with no FK to
 * `users` or `evar_participants`: reporting a bad scan has nothing to do with
 * joining the study, so it can't depend on it. The sub is how someone finds
 * their own reports and nothing else; it never leaves the API.
 *
 * `admin_note` is written for the reporter, who sees it beside the status.
 * `handled_by` is the admin's verified email, kept for the record and never
 * served, the same as `evar_case_references.updated_by`.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('evar_scan_reports', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('reporter_sub').notNullable();
    t.text('case_id').notNullable();
    // The slice the reporter was on, counted from 1 like the slider. Not every mistake is on one.
    t.integer('slice');
    t.text('kind').notNullable();
    t.text('message').notNullable();
    t.text('status').notNullable().defaultTo('open');
    t.text('admin_note');
    t.text('handled_by');
    t.timestamp('handled_at', { useTz: true });
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.check("kind in ('missing-slices', 'wrong-answers', 'image', 'other')", [], 'evar_scan_reports_kind_check');
    t.check("status in ('open', 'fixed')", [], 'evar_scan_reports_status_check');
    t.index(['status', 'created_at']);
    t.index(['reporter_sub', 'created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('evar_scan_reports');
}
