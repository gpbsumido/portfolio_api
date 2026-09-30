import type { Knex } from 'knex';

/**
 * ZeroProof anonymous telemetry. Every row is one client-side event — a page
 * view, a CTA click — delivered in batches from the browser.
 *
 * `event_uuid` is generated on the client and UNIQUE here, so an at-least-once
 * delivery layer (retries, a sendBeacon flush that races the next load) can
 * resend freely and the insert dedupes on conflict. `anon_id` is a hashed,
 * non-reversible device key, not a person; `session_id` + `seq` let a reader
 * spot a gap in a session (1, 2, 4 — where's 3?) that means events were lost in
 * flight rather than never sent.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('zeroproof_analytics_events', (t) => {
    t.uuid('event_uuid').primary();
    t.text('anon_id').notNullable();
    t.text('session_id').notNullable();
    t.integer('seq').notNullable();
    t.text('name').notNullable();
    t.text('page').notNullable();
    t.jsonb('props');
    t.text('app_version').notNullable().defaultTo('unknown');
    // Stamped in the browser at enqueue; may lag received_at by a whole session
    // when the batch only leaves on tab-exit.
    t.timestamp('client_ts', { useTz: true }).notNullable();
    t.timestamp('received_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Gap detection reads a session's events in sequence order.
    t.index(['anon_id', 'session_id', 'seq'], 'zeroproof_analytics_session_seq_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('zeroproof_analytics_events');
}
