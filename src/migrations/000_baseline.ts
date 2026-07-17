/**
 * Baseline migration — captures the full schema as of v2.7.0.
 *
 * For existing databases, mark this as already-run:
 *   INSERT INTO knex_migrations (name, batch, migration_time)
 *   VALUES ('000_baseline.ts', 1, NOW());
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── Core tables (from init.sql) ──────────────────────────────────────

  await knex.schema.createTable('locations', (t) => {
    t.increments('id').primary();
    t.decimal('latitude', 10, 8).notNullable();
    t.decimal('longitude', 11, 8).notNullable();
    t.text('text').notNullable();
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('postforum', (t) => {
    t.increments('id').primary();
    t.string('title', 255).notNullable();
    t.text('text').notNullable();
    t.string('username', 100).notNullable();
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('gallery', (t) => {
    t.increments('id').primary();
    t.text('title').notNullable();
    t.text('description').notNullable();
    t.text('image_url').notNullable();
    t.timestamp('date', { useTz: true }).notNullable();
    t.text('user_sub');
  });

  await knex.schema.createTable('med_journal', (t) => {
    t.uuid('id').primary();
    t.text('patientSetting').notNullable();
    t.text('interaction').notNullable();
    t.jsonb('canmedsRoles');
    t.jsonb('learningObjectives');
    t.text('rotation');
    t.date('date');
    t.text('location');
    t.text('hospital');
    t.text('doctor');
    t.text('whatIDidWell');
    t.text('whatICouldImprove');
    t.text('user_sub').notNullable();
  });

  await knex.schema.createTable('feedback', (t) => {
    t.uuid('id').primary();
    t.text('text').notNullable();
    t.text('rotation').notNullable();
    t.uuid('journal_entry_id').references('id').inTable('med_journal');
    t.text('user_sub').notNullable();
  });

  // ── Users & auth (from migrate_sharing.js, migrate_google_sync.js) ──

  await knex.schema.createTable('users', (t) => {
    t.text('sub').primary();
    t.text('email').notNullable().unique();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');

  await knex.schema.createTable('google_auth', (t) => {
    t.text('user_id').primary();
    t.text('access_token').notNullable();
    t.text('refresh_token').notNullable();
    t.timestamp('token_expiry', { useTz: true }).notNullable();
    t.text('google_cal_id').notNullable().defaultTo('primary');
    t.text('channel_id');
    t.text('resource_id');
    t.timestamp('channel_expiry', { useTz: true });
    t.text('sync_token');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // ── Calendars (from migrate_calendars.js) ────────────────────────────

  await knex.schema.createTable('calendars', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('name').notNullable();
    t.text('color').notNullable().defaultTo('#3b82f6');
    t.text('user_sub').notNullable();
    t.text('google_cal_id');
    t.text('google_cal_name');
    t.text('sync_mode').notNullable().defaultTo('none');
    t.text('channel_id');
    t.text('resource_id');
    t.timestamp('channel_expiry', { useTz: true });
    t.text('sync_token');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_calendars_user ON calendars(user_sub)');
  await knex.raw(
    'CREATE INDEX IF NOT EXISTS idx_calendars_google_cal ON calendars(google_cal_id) WHERE google_cal_id IS NOT NULL',
  );

  // ── Calendar events (from init.sql + migrate.js + migrate_google_sync.js + migrate_calendars.js) ──

  await knex.schema.createTable('calendar_events', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('title').notNullable();
    t.text('description');
    t.timestamp('start_date', { useTz: true }).notNullable();
    t.timestamp('end_date', { useTz: true }).notNullable();
    t.boolean('all_day').notNullable().defaultTo(false);
    t.text('color').notNullable().defaultTo('#3b82f6');
    t.text('user_sub').notNullable();
    t.text('google_event_id');
    t.text('sync_source').defaultTo('local');
    t.uuid('calendar_id').references('id').inTable('calendars').onDelete('CASCADE');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_calendar_events_user_sub ON calendar_events(user_sub)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_calendar_events_start_date ON calendar_events(start_date)');
  await knex.raw(
    'CREATE INDEX IF NOT EXISTS idx_calendar_events_google ON calendar_events(google_event_id) WHERE google_event_id IS NOT NULL',
  );

  // ── Calendar members (from migrate_sharing.js) ───────────────────────

  await knex.schema.createTable('calendar_members', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('calendar_id').notNullable().references('id').inTable('calendars').onDelete('CASCADE');
    t.text('user_sub').notNullable().references('sub').inTable('users').onDelete('CASCADE');
    t.text('role').notNullable().defaultTo('editor');
    t.text('invited_by').references('sub').inTable('users').onDelete('SET NULL');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['calendar_id', 'user_sub']);
  });
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_calendar_members_user ON calendar_members(user_sub)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_calendar_members_calendar ON calendar_members(calendar_id)');

  // ── Event cards (from migrate_tcg.js) ────────────────────────────────

  await knex.schema.createTable('event_cards', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('event_id').notNullable().references('id').inTable('calendar_events').onDelete('CASCADE');
    t.text('card_id').notNullable();
    t.text('card_name').notNullable();
    t.text('card_set_id');
    t.text('card_set_name');
    t.text('card_image_url');
    t.integer('quantity').notNullable().defaultTo(1);
    t.text('notes');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_event_cards_event_id ON event_cards(event_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_event_cards_card_id ON event_cards(card_id)');

  // ── Countdowns (from init.sql / migrate_countdowns.js) ───────────────

  await knex.schema.createTable('countdowns', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('title').notNullable();
    t.text('description');
    t.date('target_date').notNullable();
    t.text('color').notNullable().defaultTo('#6366f1');
    t.text('user_sub').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_countdowns_user_sub ON countdowns(user_sub)');

  // ── Social: profiles, posts, follows (from 002–005) ──────────────────

  await knex.schema.createTable('user_profiles', (t) => {
    t.text('user_sub').primary().references('sub').inTable('users').onDelete('CASCADE');
    t.text('username').notNullable().unique();
    t.text('display_name');
    t.text('bio');
    t.text('avatar_url');
    t.boolean('is_public').notNullable().defaultTo(false);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // set_updated_at trigger function (shared by profiles, posts, follows)
  await knex.raw(`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await knex.raw(`
    CREATE TRIGGER user_profiles_updated_at
      BEFORE UPDATE ON user_profiles
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  await knex.schema.createTable('posts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('user_sub').notNullable().references('user_sub').inTable('user_profiles').onDelete('CASCADE');
    t.text('type').notNullable();
    t.text('caption');
    t.text('content');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_posts_user_sub_created_at ON posts(user_sub, created_at DESC)');
  await knex.raw(`
    CREATE TRIGGER posts_updated_at
      BEFORE UPDATE ON posts
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  await knex.schema.createTable('post_media', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('post_id').notNullable().references('id').inTable('posts').onDelete('CASCADE');
    t.text('s3_key').notNullable();
    t.text('url').notNullable();
    t.integer('width');
    t.integer('height');
    t.smallint('position').notNullable().defaultTo(0);
    t.text('blur_data_url');
    t.text('media_type').notNullable().defaultTo('image');
    t.text('thumbnail_url');
    t.double('duration');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_post_media_post_id ON post_media(post_id)');

  await knex.schema.createTable('follows', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('follower_sub').notNullable().references('user_sub').inTable('user_profiles').onDelete('CASCADE');
    t.text('following_sub').notNullable().references('user_sub').inTable('user_profiles').onDelete('CASCADE');
    t.text('status').notNullable().defaultTo('pending');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['follower_sub', 'following_sub']);
  });
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_follows_following_sub_status ON follows(following_sub, status)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_follows_follower_sub_status ON follows(follower_sub, status)');
  await knex.raw(`
    CREATE TRIGGER follows_updated_at
      BEFORE UPDATE ON follows
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // ── NBA playoffs (from 006, 007) ─────────────────────────────────────

  await knex.schema.createTable('nba_playoff_brackets', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('user_sub').notNullable();
    t.integer('season').notNullable();
    t.jsonb('picks').notNullable().defaultTo('{}');
    t.text('display_name');
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    t.unique(['user_sub', 'season']);
  });
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_nba_playoff_brackets_user_sub ON nba_playoff_brackets(user_sub)');

  // ── Web vitals (from scripts/vitals/migrate.js) ──────────────────────

  await knex.schema.createTable('web_vitals', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('metric').notNullable();
    t.double('value').notNullable();
    t.text('rating').notNullable();
    t.text('page').notNullable();
    t.text('nav_type');
    t.string('app_version', 20).notNullable().defaultTo('unknown');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_web_vitals_metric ON web_vitals(metric)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_web_vitals_page ON web_vitals(page)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_web_vitals_created_at ON web_vitals(created_at)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_web_vitals_app_version ON web_vitals(app_version)');
}

export async function down(knex: Knex): Promise<void> {
  // Drop in reverse dependency order
  await knex.schema.dropTableIfExists('web_vitals');
  await knex.schema.dropTableIfExists('nba_playoff_brackets');
  await knex.schema.dropTableIfExists('follows');
  await knex.schema.dropTableIfExists('post_media');
  await knex.schema.dropTableIfExists('posts');
  await knex.raw('DROP TRIGGER IF EXISTS user_profiles_updated_at ON user_profiles');
  await knex.raw('DROP TRIGGER IF EXISTS posts_updated_at ON posts');
  await knex.raw('DROP TRIGGER IF EXISTS follows_updated_at ON follows');
  await knex.schema.dropTableIfExists('user_profiles');
  await knex.schema.dropTableIfExists('countdowns');
  await knex.schema.dropTableIfExists('event_cards');
  await knex.schema.dropTableIfExists('calendar_members');
  await knex.schema.dropTableIfExists('calendar_events');
  await knex.schema.dropTableIfExists('calendars');
  await knex.schema.dropTableIfExists('google_auth');
  await knex.schema.dropTableIfExists('users');
  await knex.schema.dropTableIfExists('feedback');
  await knex.schema.dropTableIfExists('med_journal');
  await knex.schema.dropTableIfExists('gallery');
  await knex.schema.dropTableIfExists('postforum');
  await knex.schema.dropTableIfExists('locations');
  await knex.raw('DROP FUNCTION IF EXISTS set_updated_at()');
}
