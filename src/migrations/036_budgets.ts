import type { Knex } from 'knex';

/**
 * Shared budgets, surfaced at /budget in paul-explore.
 *
 * The frontend shipped this browser-only first, behind a storage seam, with the
 * sharing "said out loud" as a local stand-in. This is the backend it was shaped
 * for: a budget owned by a user, people to attribute spend to, members who can
 * read and write it, expenses, and join requests so someone can ask to join a
 * public budget by the owner's email.
 *
 * People and members are kept separate on purpose. A `budget_people` row is a
 * label you split against — it may be someone with no account at all — while a
 * `budget_members` row is an account with access. When a request is approved the
 * joiner gets both: a member row for access and a person row for attribution,
 * linked by `user_sub`.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('budgets', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('owner_sub').notNullable().references('sub').inTable('users').onDelete('CASCADE');
    t.text('name').notNullable().defaultTo('My budget');
    t.integer('cycle_start_day').notNullable().defaultTo(1);
    // 'private' | 'public'. Free text with a check so adding a level later needs
    // no migration, but a typo still can't slip in.
    t.text('visibility').notNullable().defaultTo('private');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['owner_sub'], 'budgets_owner_idx');
  });
  await knex.raw(
    `ALTER TABLE budgets ADD CONSTRAINT budgets_visibility_check CHECK (visibility IN ('private','public'))`,
  );

  await knex.schema.createTable('budget_people', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('budget_id').notNullable().references('id').inTable('budgets').onDelete('CASCADE');
    t.text('name').notNullable();
    // Set once a member is mapped to this person; null for a plain label.
    t.text('user_sub').references('sub').inTable('users').onDelete('SET NULL');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['budget_id'], 'budget_people_budget_idx');
  });

  await knex.schema.createTable('budget_members', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('budget_id').notNullable().references('id').inTable('budgets').onDelete('CASCADE');
    t.text('user_sub').notNullable().references('sub').inTable('users').onDelete('CASCADE');
    t.text('role').notNullable().defaultTo('editor');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    // One membership per account per budget.
    t.unique(['budget_id', 'user_sub']);
    t.index(['budget_id'], 'budget_members_budget_idx');
    t.index(['user_sub'], 'budget_members_user_idx');
  });

  await knex.schema.createTable('budget_expenses', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('budget_id').notNullable().references('id').inTable('budgets').onDelete('CASCADE');
    t.text('category_id').notNullable();
    t.integer('amount_cents').notNullable();
    t.timestamp('occurred_at', { useTz: true }).notNullable();
    t.uuid('person_id').references('id').inTable('budget_people').onDelete('SET NULL');
    // tags as a json array, splits as [{personId, amountCents}] or null — the
    // exact shapes the frontend already stores, so the BFF passes them through.
    t.jsonb('tags').notNullable().defaultTo('[]');
    t.jsonb('splits');
    // Optional free text: `note` is the name/reason for the spend, `vendor` is
    // where it went. Both are shown on the item and searchable later.
    t.text('note');
    t.text('vendor');
    t.text('created_by_sub');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['budget_id', 'occurred_at'], 'budget_expenses_budget_time_idx');
  });

  await knex.schema.createTable('budget_join_requests', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('budget_id').notNullable().references('id').inTable('budgets').onDelete('CASCADE');
    t.text('requester_sub').notNullable().references('sub').inTable('users').onDelete('CASCADE');
    t.text('requester_name').notNullable();
    t.text('status').notNullable().defaultTo('pending');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    // One outstanding request per person per budget.
    t.unique(['budget_id', 'requester_sub']);
    t.index(['budget_id'], 'budget_join_requests_budget_idx');
  });
  await knex.raw(
    `ALTER TABLE budget_join_requests ADD CONSTRAINT budget_join_requests_status_check CHECK (status IN ('pending','approved','denied'))`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('budget_join_requests');
  await knex.schema.dropTableIfExists('budget_expenses');
  await knex.schema.dropTableIfExists('budget_members');
  await knex.schema.dropTableIfExists('budget_people');
  await knex.schema.dropTableIfExists('budgets');
}
