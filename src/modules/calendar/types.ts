// ---------------------------------------------------------------------------
// Calendar module — TypeScript type definitions
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Raw DB row types (snake_case, as they come from Knex/pg)
// ---------------------------------------------------------------------------

export interface CalendarEventRow {
  id: string;
  title: string;
  description: string | null;
  start_date: Date | string;
  end_date: Date | string;
  all_day: boolean;
  color: string;
  calendar_id: string | null;
  user_sub: string;
  google_event_id: string | null;
  sync_source: 'local' | 'google';
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CalendarRow {
  id: string;
  name: string;
  color: string;
  user_sub: string;
  google_cal_id: string | null;
  google_cal_name: string | null;
  sync_mode: 'none' | 'push' | 'two_way';
  channel_id: string | null;
  resource_id: string | null;
  channel_expiry: Date | string | null;
  sync_token: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  // present when querying with UNION (getCalendars)
  role?: string;
  owner_sub?: string | null;
  owner_email?: string | null;
}

export interface CalendarMemberRow {
  id: string;
  calendar_id: string;
  user_sub: string;
  role: 'editor' | 'viewer';
  invited_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  // joined from users table
  email?: string | null;
}

export interface EventCardRow {
  id: string;
  event_id: string;
  card_id: string;
  card_name: string;
  card_set_id: string | null;
  card_set_name: string | null;
  card_image_url: string | null;
  quantity: number;
  notes: string | null;
  created_at: Date | string;
}

export interface CountdownRow {
  id: string;
  title: string;
  description: string | null;
  target_date: string; // DATE column comes back as "YYYY-MM-DD"
  color: string;
  user_sub: string;
  created_at: Date | string;
}

export interface UserRow {
  sub: string;
  email: string | null;
  updated_at: Date | string;
}

// ---------------------------------------------------------------------------
// Frontend-facing types (camelCase)
// ---------------------------------------------------------------------------

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  color: string;
  calendarId?: string;
  googleEventId?: string;
}

export interface Calendar {
  id: string;
  name: string;
  color: string;
  userSub: string;
  googleCalId?: string;
  googleCalName?: string;
  syncMode: string;
  channelId?: string;
  resourceId?: string;
  channelExpiry?: string;
  syncToken?: string;
  createdAt: string;
  updatedAt: string;
  // sharing context (present for getCalendars results)
  role?: string;
  ownerSub?: string;
  ownerEmail?: string;
}

export interface CalendarMember {
  id: string | null;
  calendarId: string;
  userSub: string;
  email: string | null;
  role: string;
  invitedBy: string | null;
  createdAt: string;
}

export interface EventCard {
  id: string;
  eventId: string;
  cardId: string;
  cardName: string;
  cardSetId?: string;
  cardSetName?: string;
  cardImageUrl?: string;
  quantity: number;
  notes?: string;
  createdAt: string;
}

export interface Countdown {
  id: string;
  title: string;
  description?: string;
  targetDate: string;
  color: string;
  createdAt: string;
}

export interface User {
  sub: string;
  email: string | null;
}

// ---------------------------------------------------------------------------
// Input / filter types
// ---------------------------------------------------------------------------

export interface CreateCalendarEventInput {
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  allDay?: boolean;
  color?: string;
  calendarId?: string;
}

export interface UpdateCalendarEventInput {
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  allDay?: boolean;
  color?: string;
}

export interface CalendarEventFilters {
  start?: string;
  end?: string;
  cardId?: string;
  cardName?: string;
  calendarId?: string;
}

export interface CreateCalendarInput {
  name: string;
  color?: string;
  syncMode?: string;
}

export interface UpdateCalendarInput {
  name?: string;
  color?: string;
  syncMode?: string | null;
  googleCalId?: string | null;
  googleCalName?: string | null;
  channelId?: string | null;
  resourceId?: string | null;
  channelExpiry?: string | null;
  syncToken?: string | null;
}

export interface CreateCountdownInput {
  title: string;
  description?: string;
  targetDate: string;
  color?: string;
}

export interface UpdateCountdownInput {
  title?: string;
  description?: string;
  targetDate?: string;
  color?: string;
}

export interface AddEventCardInput {
  eventId: string;
  cardId: string;
  cardName: string;
  cardSetId?: string;
  cardSetName?: string;
  cardImageUrl?: string;
  quantity?: number;
  notes?: string;
}

export interface UpdateEventCardInput {
  quantity?: number;
  notes?: string;
}

export interface CountdownPage {
  countdowns: Countdown[];
  nextCursor: string | null;
}

export type RequiredRole = 'owner' | 'editor';
