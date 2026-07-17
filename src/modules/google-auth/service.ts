import crypto from 'crypto';
import { env } from '../../config/env.js';
import { createModuleLogger } from '../../shared/utils/logger.js';
import type { OAuthState, GoogleCalendarItem, WebhookEventFields } from './types.js';

const log = createModuleLogger('google-auth');

// JS utils not yet migrated — typed loosely
// eslint-disable-next-line @typescript-eslint/no-var-requires
const db = require('../../../utils/db') as any;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { registerWatch, stopWatch, fetchIncrementalEvents } = require('../../../utils/googleCalendar') as {
  registerWatch: (userId: string) => Promise<void>;
  stopWatch: (userId: string) => Promise<void>;
  fetchIncrementalEvents: (
    userId: string,
    syncToken: string | null,
    googleCalId?: string,
  ) => Promise<{ items: GoogleCalendarItem[]; nextSyncToken: string }>;
};

export { db, registerWatch, stopWatch, fetchIncrementalEvents };

const ALLOWED_ORIGINS = new Set([
  'https://paulsumido.com',
  'https://develop.paulsumido.com',
  'http://localhost:3000',
]);

export { ALLOWED_ORIGINS };

const GOOGLE_COLOR_TO_HEX: Record<string, string> = {
  '7': '#3b82f6',
  '10': '#10b981',
  '5': '#f59e0b',
  '11': '#ef4444',
  '3': '#8b5cf6',
  '4': '#ec4899',
  '6': '#f97316',
  '9': '#3b82f6',
};

const SYNC_BUFFER_MS = 10_000;

export function signState(payload: string): string {
  return crypto
    .createHmac('sha256', env.GOOGLE_STATE_SECRET!)
    .update(payload)
    .digest('hex');
}

export function buildState(userId: string, origin: string): string {
  const payload = Buffer.from(JSON.stringify({ userId, origin })).toString('base64url');
  const sig = signState(payload);
  return `${payload}.${sig}`;
}

export function verifyState(state: string | undefined): OAuthState | null {
  if (!state || !state.includes('.')) return null;
  const dotIdx = state.lastIndexOf('.');
  const payload = state.slice(0, dotIdx);
  const sig = state.slice(dotIdx + 1);
  const expected = signState(payload);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
      return null;
    }
  } catch {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()) as OAuthState;
  } catch {
    return null;
  }
}

export function fromGoogleEvent(item: GoogleCalendarItem): WebhookEventFields {
  const fields: WebhookEventFields = {};

  if (item.summary !== undefined) fields.title = item.summary ?? '';
  if (item.description !== undefined) fields.description = item.description ?? undefined;

  if (item.start) {
    const allDay = Boolean(item.start.date && !item.start.dateTime);
    fields.allDay = allDay;
    if (allDay) {
      fields.startDate = `${item.start.date}T12:00:00.000Z`;
      const exclusiveEnd = new Date(`${item.end!.date}T12:00:00.000Z`);
      exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() - 1);
      fields.endDate = exclusiveEnd.toISOString();
    } else {
      fields.startDate = item.start.dateTime;
      fields.endDate = item.end!.dateTime;
    }
  }

  if (item.colorId !== undefined) {
    fields.color = GOOGLE_COLOR_TO_HEX[item.colorId] ?? '#6366f1';
  }

  return fields;
}

export async function processExistingItem(
  item: GoogleCalendarItem,
  userId: string,
  existing: any,
): Promise<void> {
  if (item.status === 'cancelled') {
    log.info({ eventId: existing.id, googleEventId: item.id }, 'deleting event');
    await db.deleteCalendarEvent(existing.id, userId);
    return;
  }

  const googleUpdated = new Date(item.updated!);
  const ourUpdated = new Date(existing.updated_at);

  if (googleUpdated <= new Date(ourUpdated.getTime() + SYNC_BUFFER_MS)) {
    log.info(
      { eventId: existing.id, googleUpdated: googleUpdated.toISOString(), ourUpdated: ourUpdated.toISOString() },
      'skipping update (within buffer)',
    );
    return;
  }

  const fields = fromGoogleEvent(item);
  if (Object.keys(fields).length > 0) {
    log.info({ eventId: existing.id }, 'updating event from Google');
    await db.updateCalendarEventFromWebhook(existing.id, fields, userId);
  }
}
