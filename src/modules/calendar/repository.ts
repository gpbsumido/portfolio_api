// ---------------------------------------------------------------------------
// Calendar module — Knex-based repository
// ---------------------------------------------------------------------------

import knex, { type Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../../config/env.js';
import type {
  CalendarEvent,
  CalendarEventRow,
  Calendar,
  CalendarRow,
  CalendarMember,
  CalendarMemberRow,
  EventCard,
  EventCardRow,
  Countdown,
  CountdownRow,
  CountdownPage,
  User,
  UserRow,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
  CalendarEventFilters,
  CreateCalendarInput,
  UpdateCalendarInput,
  CreateCountdownInput,
  UpdateCountdownInput,
  AddEventCardInput,
  UpdateEventCardInput,
  RequiredRole,
} from './types.js';

// ---------------------------------------------------------------------------
// Knex instance — uses the same DATABASE_URL as the pg Pool
// ---------------------------------------------------------------------------

const connectionString =
  env.DATABASE_URL ||
  `postgresql://${env.DB_USER}:${env.DB_PASSWORD}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`;

const db: Knex = knex({
  client: 'pg',
  connection: {
    connectionString,
    ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  },
});

// ---------------------------------------------------------------------------
// Row mappers (snake_case DB rows -> camelCase frontend types)
// ---------------------------------------------------------------------------

function toCalendarEvent(row: CalendarEventRow): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    startDate:
      row.start_date instanceof Date
        ? row.start_date.toISOString()
        : row.start_date,
    endDate:
      row.end_date instanceof Date
        ? row.end_date.toISOString()
        : row.end_date,
    allDay: row.all_day,
    color: row.color,
    calendarId: row.calendar_id ?? undefined,
    googleEventId: row.google_event_id ?? undefined,
  };
}

function toCalendar(row: CalendarRow): Calendar {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    userSub: row.user_sub,
    googleCalId: row.google_cal_id ?? undefined,
    googleCalName: row.google_cal_name ?? undefined,
    syncMode: row.sync_mode,
    channelId: row.channel_id ?? undefined,
    resourceId: row.resource_id ?? undefined,
    channelExpiry:
      row.channel_expiry instanceof Date
        ? row.channel_expiry.toISOString()
        : (row.channel_expiry ?? undefined),
    syncToken: row.sync_token ?? undefined,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : (row.created_at as string),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : (row.updated_at as string),
    role: row.role ?? undefined,
    ownerSub: row.owner_sub ?? undefined,
    ownerEmail: row.owner_email ?? undefined,
  };
}

function toCalendarMember(row: CalendarMemberRow): CalendarMember {
  return {
    id: row.id,
    calendarId: row.calendar_id,
    userSub: row.user_sub,
    email: row.email ?? null,
    role: row.role,
    invitedBy: row.invited_by ?? null,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : (row.created_at as string),
  };
}

function toEventCard(row: EventCardRow): EventCard {
  return {
    id: row.id,
    eventId: row.event_id,
    cardId: row.card_id,
    cardName: row.card_name,
    cardSetId: row.card_set_id ?? undefined,
    cardSetName: row.card_set_name ?? undefined,
    cardImageUrl: row.card_image_url ?? undefined,
    quantity: row.quantity,
    notes: row.notes ?? undefined,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : (row.created_at as string),
  };
}

function toCountdown(row: CountdownRow): Countdown {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    targetDate: row.target_date,
    color: row.color,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : (row.created_at as string),
  };
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class CalendarRepository {
  // -----------------------------------------------------------------------
  // Calendar Events
  // -----------------------------------------------------------------------

  async getCalendarEvents(
    userSub: string,
    filters: CalendarEventFilters = {},
  ): Promise<CalendarEvent[]> {
    const { start, end, cardId, cardName, calendarId } = filters;
    const needsCardJoin = !!(cardId || cardName);

    let query = db<CalendarEventRow>('calendar_events as ce')
      .distinct('ce.*')
      .leftJoin('calendar_members as cm', function (this: Knex.JoinClause) {
        this.on('cm.calendar_id', '=', 'ce.calendar_id').andOn(
          'cm.user_sub',
          '=',
          db.raw('?', [userSub]),
        );
      })
      .where(function (this: Knex.QueryBuilder) {
        this.where('ce.user_sub', userSub).orWhereNotNull('cm.user_sub');
      });

    if (needsCardJoin) {
      query = query.join('event_cards as ec', 'ec.event_id', 'ce.id');
    }

    if (start) {
      query = query.where('ce.end_date', '>=', start);
    }
    if (end) {
      query = query.where('ce.start_date', '<=', end);
    }
    if (cardId) {
      query = query.where('ec.card_id', cardId);
    }
    if (cardName) {
      query = query.where('ec.card_name', 'ILIKE', `%${cardName}%`);
    }
    if (calendarId) {
      query = query.where('ce.calendar_id', calendarId);
    }

    query = query.orderBy('ce.start_date', 'asc');

    const rows = await query;
    return rows.map(toCalendarEvent);
  }

  async getCalendarEventById(
    id: string,
    userSub: string,
  ): Promise<CalendarEvent | null> {
    const rows = await db<CalendarEventRow>('calendar_events as ce')
      .select('ce.*')
      .leftJoin('calendar_members as cm', function (this: Knex.JoinClause) {
        this.on('cm.calendar_id', '=', 'ce.calendar_id').andOn(
          'cm.user_sub',
          '=',
          db.raw('?', [userSub]),
        );
      })
      .where('ce.id', id)
      .where(function (this: Knex.QueryBuilder) {
        this.where('ce.user_sub', userSub).orWhereNotNull('cm.user_sub');
      });

    return rows[0] ? toCalendarEvent(rows[0]) : null;
  }

  async createCalendarEvent(
    input: CreateCalendarEventInput,
    userSub: string,
  ): Promise<CalendarEvent> {
    const {
      title,
      description,
      startDate,
      endDate,
      allDay = false,
      color = '#3b82f6',
      calendarId,
    } = input;

    const id = uuidv4();

    // resolve the target calendar
    let resolvedCalendarId = calendarId;
    if (!resolvedCalendarId) {
      const [firstCal] = await db('calendars')
        .select('id')
        .where('user_sub', userSub)
        .orderBy('created_at', 'asc')
        .limit(1);
      resolvedCalendarId = firstCal?.id ?? undefined;
    }

    const [row] = await db<CalendarEventRow>('calendar_events')
      .insert({
        id,
        title,
        description: description || null,
        start_date: startDate as unknown as Date,
        end_date: endDate as unknown as Date,
        all_day: allDay,
        color,
        calendar_id: resolvedCalendarId ?? null,
        user_sub: userSub,
      })
      .returning('*');

    return toCalendarEvent(row);
  }

  async updateCalendarEvent(
    id: string,
    fields: UpdateCalendarEventInput,
    userSub: string,
  ): Promise<CalendarEvent | null> {
    const colMap: Record<string, string> = {
      title: 'title',
      description: 'description',
      startDate: 'start_date',
      endDate: 'end_date',
      allDay: 'all_day',
      color: 'color',
    };

    const updates: Record<string, unknown> = {};
    for (const [key, col] of Object.entries(colMap)) {
      if (key in fields) {
        updates[col] = (fields as Record<string, unknown>)[key];
      }
    }
    if (Object.keys(updates).length === 0) return null;

    // always reset sync_source on user-driven update
    updates.sync_source = 'local';
    updates.updated_at = new Date();

    // editors on shared calendars can also update
    const allowedIds = db('calendar_events as ce2')
      .select('ce2.id')
      .leftJoin('calendar_members as cm', function (this: Knex.JoinClause) {
        this.on('cm.calendar_id', '=', 'ce2.calendar_id')
          .andOn('cm.user_sub', '=', db.raw('?', [userSub]))
          .andOn('cm.role', '=', db.raw("'editor'"));
      })
      .where('ce2.id', id)
      .where(function (this: Knex.QueryBuilder) {
        this.where('ce2.user_sub', userSub).orWhereNotNull('cm.user_sub');
      });

    const rows = await db<CalendarEventRow>('calendar_events')
      .whereIn('id', allowedIds)
      .update(updates)
      .returning('*');

    return rows[0] ? toCalendarEvent(rows[0]) : null;
  }

  async deleteCalendarEvent(
    id: string,
    userSub: string,
  ): Promise<CalendarEvent | null> {
    // editors on shared calendars can also delete
    const rows = await db.raw<{ rows: CalendarEventRow[] }>(
      `DELETE FROM calendar_events
       WHERE id = ?
         AND (
           user_sub = ?
           OR EXISTS (
             SELECT 1 FROM calendar_members cm
             JOIN calendar_events ce ON ce.id = ?
             WHERE cm.calendar_id = ce.calendar_id AND cm.user_sub = ? AND cm.role = 'editor'
           )
         )
       RETURNING *`,
      [id, userSub, id, userSub],
    );

    return rows.rows[0] ? toCalendarEvent(rows.rows[0]) : null;
  }

  // -----------------------------------------------------------------------
  // Calendars
  // -----------------------------------------------------------------------

  async getCalendars(userSub: string): Promise<Calendar[]> {
    const result = await db.raw<{ rows: CalendarRow[] }>(
      `SELECT c.*, 'owner' AS role, NULL AS owner_sub, NULL AS owner_email
       FROM   calendars c
       WHERE  c.user_sub = ?
       UNION ALL
       SELECT c.*, cm.role, c.user_sub AS owner_sub, u.email AS owner_email
       FROM   calendars c
       JOIN   calendar_members cm ON cm.calendar_id = c.id AND cm.user_sub = ?
       JOIN   users u ON u.sub = c.user_sub
       ORDER  BY created_at ASC`,
      [userSub, userSub],
    );
    return result.rows.map(toCalendar);
  }

  async getCalendarById(
    id: string,
    userSub: string,
  ): Promise<Calendar | null> {
    const row = await db<CalendarRow>('calendars')
      .where({ id, user_sub: userSub })
      .first();
    return row ? toCalendar(row) : null;
  }

  async getCalendarByGoogleCalId(
    googleCalId: string,
    userSub: string,
  ): Promise<Calendar | null> {
    const row = await db<CalendarRow>('calendars')
      .where({ google_cal_id: googleCalId, user_sub: userSub })
      .first();
    return row ? toCalendar(row) : null;
  }

  async getCalendarForMutation(
    calendarId: string,
    userSub: string,
    requiredRole: RequiredRole,
  ): Promise<Calendar | null> {
    let query: Knex.QueryBuilder;

    if (requiredRole === 'owner') {
      query = db<CalendarRow>('calendars')
        .where({ id: calendarId, user_sub: userSub });
    } else {
      query = db<CalendarRow>('calendars as c')
        .select('c.*')
        .where('c.id', calendarId)
        .where(function (this: Knex.QueryBuilder) {
          this.where('c.user_sub', userSub).orWhereExists(
            db('calendar_members')
              .where({
                calendar_id: calendarId,
                user_sub: userSub,
                role: 'editor',
              })
              .select(db.raw('1')),
          );
        });
    }

    const rows = await query;
    return rows[0] ? toCalendar(rows[0]) : null;
  }

  async createCalendar(
    input: CreateCalendarInput,
    userSub: string,
  ): Promise<Calendar> {
    const { name, color = '#3b82f6', syncMode = 'none' } = input;
    const id = uuidv4();

    const [row] = await db<CalendarRow>('calendars')
      .insert({
        id,
        name,
        color,
        user_sub: userSub,
        sync_mode: syncMode as CalendarRow['sync_mode'],
      })
      .returning('*');

    return toCalendar(row);
  }

  async updateCalendar(
    id: string,
    fields: UpdateCalendarInput,
    userSub: string,
  ): Promise<Calendar | null> {
    const colMap: Record<string, string> = {
      name: 'name',
      color: 'color',
      syncMode: 'sync_mode',
      googleCalId: 'google_cal_id',
      googleCalName: 'google_cal_name',
      channelId: 'channel_id',
      resourceId: 'resource_id',
      channelExpiry: 'channel_expiry',
      syncToken: 'sync_token',
    };

    const updates: Record<string, unknown> = {};
    for (const [key, col] of Object.entries(colMap)) {
      if (key in fields) {
        updates[col] = (fields as Record<string, unknown>)[key];
      }
    }
    if (Object.keys(updates).length === 0) return null;

    updates.updated_at = new Date();

    const [row] = await db<CalendarRow>('calendars')
      .where({ id, user_sub: userSub })
      .update(updates)
      .returning('*');

    return row ? toCalendar(row) : null;
  }

  async deleteCalendar(
    id: string,
    userSub: string,
  ): Promise<Calendar | null> {
    const [row] = await db<CalendarRow>('calendars')
      .where({ id, user_sub: userSub })
      .del()
      .returning('*');

    return row ? toCalendar(row) : null;
  }

  // -----------------------------------------------------------------------
  // Calendar Members
  // -----------------------------------------------------------------------

  async getCalendarMembers(calendarId: string): Promise<CalendarMember[]> {
    const rows = await db<CalendarMemberRow>('calendar_members as cm')
      .select('cm.*', 'u.email')
      .join('users as u', 'u.sub', 'cm.user_sub')
      .where('cm.calendar_id', calendarId)
      .orderBy('cm.created_at', 'asc');

    return rows.map(toCalendarMember);
  }

  async addCalendarMember(
    calendarId: string,
    memberSub: string,
    role: string,
    invitedBySub: string,
  ): Promise<CalendarMember> {
    const result = await db.raw<{ rows: CalendarMemberRow[] }>(
      `WITH ins AS (
         INSERT INTO calendar_members (id, calendar_id, user_sub, role, invited_by)
         VALUES (gen_random_uuid(), ?, ?, ?, ?)
         ON CONFLICT (calendar_id, user_sub) DO UPDATE
           SET role = EXCLUDED.role, updated_at = NOW()
         RETURNING *
       )
       SELECT ins.*, u.email
       FROM   ins
       JOIN   users u ON u.sub = ins.user_sub`,
      [calendarId, memberSub, role, invitedBySub],
    );
    return toCalendarMember(result.rows[0]);
  }

  async updateCalendarMemberRole(
    calendarId: string,
    memberSub: string,
    role: string,
    ownerSub: string,
  ): Promise<CalendarMember | null> {
    const [row] = await db.raw<{ rows: CalendarMemberRow[] }>(
      `UPDATE calendar_members SET role = ?, updated_at = NOW()
       WHERE  calendar_id = ? AND user_sub = ?
       AND EXISTS (SELECT 1 FROM calendars WHERE id = ? AND user_sub = ?)
       RETURNING *`,
      [role, calendarId, memberSub, calendarId, ownerSub],
    ).then((r: { rows: CalendarMemberRow[] }) => r.rows);

    if (!row) return null;
    const user = await this.getUserBySub(memberSub);
    return toCalendarMember({ ...row, email: user?.email ?? null });
  }

  async removeCalendarMember(
    calendarId: string,
    memberSub: string,
    ownerSub: string,
  ): Promise<CalendarMember | null> {
    const [row] = await db.raw<{ rows: CalendarMemberRow[] }>(
      `DELETE FROM calendar_members
       WHERE  calendar_id = ? AND user_sub = ?
       AND EXISTS (SELECT 1 FROM calendars WHERE id = ? AND user_sub = ?)
       RETURNING *`,
      [calendarId, memberSub, calendarId, ownerSub],
    ).then((r: { rows: CalendarMemberRow[] }) => r.rows);

    if (!row) return null;
    const user = await this.getUserBySub(memberSub);
    return toCalendarMember({ ...row, email: user?.email ?? null });
  }

  /**
   * Self-removal: a member leaves a shared calendar. No ownership check.
   * Returns the deleted row or null if they weren't a member.
   */
  async removeSelfFromCalendar(
    calendarId: string,
    userSub: string,
  ): Promise<CalendarMemberRow | null> {
    const [row] = await db<CalendarMemberRow>('calendar_members')
      .where({ calendar_id: calendarId, user_sub: userSub })
      .del()
      .returning('*');
    return row ?? null;
  }

  /**
   * Returns the calendar row with the owner sub for self-removal ACL cleanup.
   */
  async getCalendarOwnerInfo(
    calendarId: string,
  ): Promise<{ googleCalId: string | null; syncMode: string; ownerSub: string } | null> {
    const row = await db('calendars')
      .select('google_cal_id as googleCalId', 'sync_mode as syncMode', 'user_sub as ownerSub')
      .where('id', calendarId)
      .first();
    return row ?? null;
  }

  // -----------------------------------------------------------------------
  // Event Cards
  // -----------------------------------------------------------------------

  async getEventCards(eventId: string, userSub: string): Promise<EventCard[]> {
    const rows = await db<EventCardRow>('event_cards as ec')
      .select('ec.*')
      .join('calendar_events as ce', 'ce.id', 'ec.event_id')
      .where('ec.event_id', eventId)
      .where('ce.user_sub', userSub)
      .orderBy('ec.created_at', 'asc');

    return rows.map(toEventCard);
  }

  async addEventCard(
    input: AddEventCardInput,
    userSub: string,
  ): Promise<EventCard | null> {
    const { eventId, cardId, cardName, cardSetId, cardSetName, cardImageUrl, quantity, notes } = input;

    // verify ownership
    const owned = await db('calendar_events')
      .where({ id: eventId, user_sub: userSub })
      .select('id');
    if (owned.length === 0) return null;

    const id = uuidv4();
    const [row] = await db<EventCardRow>('event_cards')
      .insert({
        id,
        event_id: eventId,
        card_id: cardId,
        card_name: cardName,
        card_set_id: cardSetId || null,
        card_set_name: cardSetName || null,
        card_image_url: cardImageUrl || null,
        quantity: quantity ?? 1,
        notes: notes || null,
      })
      .returning('*');

    return row ? toEventCard(row) : null;
  }

  async updateEventCard(
    entryId: string,
    eventId: string,
    fields: UpdateEventCardInput,
    userSub: string,
  ): Promise<EventCard | null> {
    const colMap: Record<string, string> = { quantity: 'quantity', notes: 'notes' };
    const updates: Record<string, unknown> = {};

    for (const [key, col] of Object.entries(colMap)) {
      if (key in fields) {
        updates[col] = (fields as Record<string, unknown>)[key];
      }
    }
    if (Object.keys(updates).length === 0) return null;

    const rows = await db.raw<{ rows: EventCardRow[] }>(
      `UPDATE event_cards ec
       SET ${Object.entries(updates)
         .map(([col], i) => `${col} = $${i + 1}`)
         .join(', ')}
       FROM calendar_events ce
       WHERE ec.id = $${Object.keys(updates).length + 1}
         AND ec.event_id = $${Object.keys(updates).length + 2}
         AND ec.event_id = ce.id
         AND ce.user_sub = $${Object.keys(updates).length + 3}
       RETURNING ec.*`,
      [...Object.values(updates), entryId, eventId, userSub] as readonly string[],
    );

    return rows.rows[0] ? toEventCard(rows.rows[0]) : null;
  }

  async deleteEventCard(
    entryId: string,
    eventId: string,
    userSub: string,
  ): Promise<EventCard | null> {
    const rows = await db.raw<{ rows: EventCardRow[] }>(
      `DELETE FROM event_cards ec
       USING calendar_events ce
       WHERE ec.id = ?
         AND ec.event_id = ?
         AND ec.event_id = ce.id
         AND ce.user_sub = ?
       RETURNING ec.*`,
      [entryId, eventId, userSub],
    );

    return rows.rows[0] ? toEventCard(rows.rows[0]) : null;
  }

  // -----------------------------------------------------------------------
  // Countdowns
  // -----------------------------------------------------------------------

  private static readonly COUNTDOWN_PAGE_SIZE = 50;

  async getCountdowns(
    userSub: string,
    cursor: string | null = null,
  ): Promise<CountdownPage> {
    const limit = CalendarRepository.COUNTDOWN_PAGE_SIZE;

    let query = db<CountdownRow>('countdowns')
      .where('user_sub', userSub)
      .orderBy([
        { column: 'target_date', order: 'asc' },
        { column: 'id', order: 'asc' },
      ])
      .limit(limit + 1);

    if (cursor) {
      const sep = cursor.indexOf('__');
      const cursorDate = cursor.slice(0, sep);
      const cursorId = cursor.slice(sep + 2);
      query = query.where(function (this: Knex.QueryBuilder) {
        this.where('target_date', '>', cursorDate).orWhere(function (this: Knex.QueryBuilder) {
          this.where('target_date', cursorDate).where('id', '>', cursorId);
        });
      });
    }

    const rows = await query;
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).map(toCountdown);

    const nextCursor = hasMore
      ? `${rows[limit - 1].target_date}__${rows[limit - 1].id}`
      : null;

    return { countdowns: page, nextCursor };
  }

  async getCountdownById(
    id: string,
    userSub: string,
  ): Promise<Countdown | null> {
    const row = await db<CountdownRow>('countdowns')
      .where({ id, user_sub: userSub })
      .first();
    return row ? toCountdown(row) : null;
  }

  async createCountdown(
    input: CreateCountdownInput,
    userSub: string,
  ): Promise<Countdown> {
    const { title, description, targetDate, color = '#6366f1' } = input;
    const id = uuidv4();

    const [row] = await db<CountdownRow>('countdowns')
      .insert({
        id,
        title,
        description: description || null,
        target_date: targetDate,
        color,
        user_sub: userSub,
      })
      .returning('*');

    return toCountdown(row);
  }

  async updateCountdown(
    id: string,
    fields: UpdateCountdownInput,
    userSub: string,
  ): Promise<Countdown | null> {
    const colMap: Record<string, string> = {
      title: 'title',
      description: 'description',
      targetDate: 'target_date',
      color: 'color',
    };

    const updates: Record<string, unknown> = {};
    for (const [key, col] of Object.entries(colMap)) {
      if (key in fields) {
        updates[col] = (fields as Record<string, unknown>)[key];
      }
    }
    if (Object.keys(updates).length === 0) return null;

    const [row] = await db<CountdownRow>('countdowns')
      .where({ id, user_sub: userSub })
      .update(updates)
      .returning('*');

    return row ? toCountdown(row) : null;
  }

  async deleteCountdown(
    id: string,
    userSub: string,
  ): Promise<Countdown | null> {
    const [row] = await db<CountdownRow>('countdowns')
      .where({ id, user_sub: userSub })
      .del()
      .returning('*');

    return row ? toCountdown(row) : null;
  }

  // -----------------------------------------------------------------------
  // Google Calendar sync helpers
  // -----------------------------------------------------------------------

  async setEventGoogleId(
    eventId: string,
    googleEventId: string,
    userSub: string,
  ): Promise<void> {
    await db('calendar_events')
      .where({ id: eventId, user_sub: userSub })
      .update({ google_event_id: googleEventId });
  }

  async getEventByGoogleId(
    googleEventId: string,
    userSub: string,
  ): Promise<CalendarEventRow | null> {
    const row = await db<CalendarEventRow>('calendar_events')
      .where({ google_event_id: googleEventId, user_sub: userSub })
      .first();
    return row ?? null;
  }

  async updateCalendarEventFromWebhook(
    id: string,
    fields: UpdateCalendarEventInput,
    userSub: string,
  ): Promise<CalendarEvent | null> {
    const colMap: Record<string, string> = {
      title: 'title',
      description: 'description',
      startDate: 'start_date',
      endDate: 'end_date',
      allDay: 'all_day',
      color: 'color',
    };

    const updates: Record<string, unknown> = {};
    for (const [key, col] of Object.entries(colMap)) {
      if (key in fields) {
        updates[col] = (fields as Record<string, unknown>)[key];
      }
    }
    if (Object.keys(updates).length === 0) return null;

    updates.sync_source = 'google';
    updates.updated_at = new Date();

    const [row] = await db<CalendarEventRow>('calendar_events')
      .where({ id, user_sub: userSub })
      .update(updates)
      .returning('*');

    return row ? toCalendarEvent(row) : null;
  }

  async createCalendarEventFromWebhook(
    fields: {
      title?: string;
      description?: string;
      startDate: string;
      endDate: string;
      allDay?: boolean;
      color?: string;
    },
    googleEventId: string,
    calendarId: string,
    userSub: string,
  ): Promise<CalendarEvent> {
    const {
      title = '',
      description,
      startDate,
      endDate,
      allDay = false,
      color = '#3b82f6',
    } = fields;

    const id = uuidv4();

    const [row] = await db<CalendarEventRow>('calendar_events')
      .insert({
        id,
        title,
        description: description || null,
        start_date: startDate as unknown as Date,
        end_date: endDate as unknown as Date,
        all_day: allDay,
        color,
        calendar_id: calendarId,
        user_sub: userSub,
        google_event_id: googleEventId,
        sync_source: 'google',
      })
      .returning('*');

    return toCalendarEvent(row);
  }

  // -----------------------------------------------------------------------
  // Users (used by sharing / member lookups)
  // -----------------------------------------------------------------------

  async getUserBySub(sub: string): Promise<User | null> {
    const row = await db<UserRow>('users').where({ sub }).first();
    return row ? { sub: row.sub, email: row.email } : null;
  }

  async getUserByEmail(email: string): Promise<(User & { sub: string }) | null> {
    const row = await db<UserRow>('users').where({ email }).first();
    return row ? { sub: row.sub, email: row.email } : null;
  }

  /**
   * Checks if a user is the owner or a member of a calendar.
   * Returns true if either condition is met.
   */
  async isOwnerOrMember(calendarId: string, userSub: string): Promise<boolean> {
    const result = await db.raw<{ rows: { exists: boolean }[] }>(
      `SELECT EXISTS(
        SELECT 1 FROM calendars WHERE id = ? AND user_sub = ?
        UNION
        SELECT 1 FROM calendar_members WHERE calendar_id = ? AND user_sub = ?
      )`,
      [calendarId, userSub, calendarId, userSub],
    );
    return result.rows[0]?.exists ?? false;
  }

  /**
   * Returns the raw calendar row for membership checks in the controller.
   */
  async getCalendarRowById(id: string): Promise<CalendarRow | null> {
    const row = await db<CalendarRow>('calendars').where({ id }).first();
    return row ?? null;
  }
}
