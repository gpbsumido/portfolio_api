// ---------------------------------------------------------------------------
// Calendar module — Service (business logic layer)
// ---------------------------------------------------------------------------

import { CalendarRepository } from './repository.js';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from '../../shared/errors/index.js';
import type {
  CalendarEvent,
  Calendar,
  CalendarMember,
  CalendarMemberRow,
  EventCard,
  Countdown,
  CountdownPage,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
  CalendarEventFilters,
  CreateCalendarInput,
  UpdateCalendarInput,
  CreateCountdownInput,
  UpdateCountdownInput,
  AddEventCardInput,
  UpdateEventCardInput,
  User,
} from './types.js';

// Google Calendar utils are not yet migrated to TypeScript.
// Typed stubs are declared below so service methods can call them;
// the actual implementations will be imported once that migration lands.
// For now callers pass these in or the controller wires them up.

/* eslint-disable @typescript-eslint/no-explicit-any */
type CreateGoogleEventFn = (userSub: string, event: CalendarEvent, calendarId: string) => Promise<string>;
type UpdateGoogleEventFn = (userSub: string, googleEventId: string | undefined, event: CalendarEvent, calendarId: string) => Promise<void>;
type DeleteGoogleEventFn = (userSub: string, googleEventId: string | undefined, calendarId: string) => Promise<void>;
type StopWatchByCalIdFn = (userSub: string, googleCalId: string) => Promise<void>;
type CreateDedicatedCalendarFn = (token: string, name: string) => Promise<{ calId: string; calName: string }>;
type RegisterWatchFn = (userSub: string, calId: string) => Promise<void>;
type GetValidAccessTokenFn = (userSub: string) => Promise<string>;
type AddCalendarAclEntryFn = (userSub: string, googleCalId: string, email: string, role: string) => Promise<void>;
type RemoveCalendarAclEntryFn = (userSub: string, googleCalId: string, email: string) => Promise<void>;
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface GoogleCalendarUtils {
  createGoogleEvent: CreateGoogleEventFn;
  updateGoogleEvent: UpdateGoogleEventFn;
  deleteGoogleEvent: DeleteGoogleEventFn;
  stopWatchByCalId: StopWatchByCalIdFn;
  createDedicatedCalendar: CreateDedicatedCalendarFn;
  registerWatch: RegisterWatchFn;
  getValidAccessToken: GetValidAccessTokenFn;
  addCalendarAclEntry: AddCalendarAclEntryFn;
  removeCalendarAclEntry: RemoveCalendarAclEntryFn;
}

const repo = new CalendarRepository();

export class CalendarService {
  private google: GoogleCalendarUtils | null;

  constructor(googleUtils: GoogleCalendarUtils | null = null) {
    this.google = googleUtils;
  }

  // -----------------------------------------------------------------------
  // Calendar Events
  // -----------------------------------------------------------------------

  async getEvents(
    userSub: string,
    filters: CalendarEventFilters,
  ): Promise<CalendarEvent[]> {
    return repo.getCalendarEvents(userSub, filters);
  }

  async getEventById(
    id: string,
    userSub: string,
  ): Promise<CalendarEvent> {
    const event = await repo.getCalendarEventById(id, userSub);
    if (!event) throw new NotFoundError('Event not found');
    return event;
  }

  async createEvent(
    input: CreateCalendarEventInput,
    userSub: string,
  ): Promise<CalendarEvent> {
    if (!input.title || !input.startDate || !input.endDate) {
      throw new ValidationError('title, startDate, and endDate are required');
    }

    const event = await repo.createCalendarEvent(input, userSub);

    // Push to Google after the DB write (non-fatal)
    if (this.google && event.calendarId) {
      try {
        const calendar = await repo.getCalendarForMutation(
          event.calendarId,
          userSub,
          'editor',
        );
        let googleEventId: string | undefined;
        if (calendar?.syncMode === 'push') {
          googleEventId = await this.google.createGoogleEvent(
            userSub,
            event,
            'primary',
          );
        } else if (
          calendar?.syncMode === 'two_way' &&
          calendar.googleCalId
        ) {
          googleEventId = await this.google.createGoogleEvent(
            userSub,
            event,
            calendar.googleCalId,
          );
        }
        if (googleEventId) {
          await repo.setEventGoogleId(event.id, googleEventId, userSub);
        }
      } catch (syncErr) {
        console.error(
          'CalendarService.createEvent Google sync failed:',
          (syncErr as Error).message,
        );
      }
    }

    return event;
  }

  async updateEvent(
    id: string,
    fields: UpdateCalendarEventInput,
    userSub: string,
  ): Promise<CalendarEvent> {
    if (!fields || Object.keys(fields).length === 0) {
      throw new ValidationError('No fields provided to update');
    }

    const event = await repo.updateCalendarEvent(id, fields, userSub);
    if (!event) throw new NotFoundError('Event not found');

    // Sync the change to Google (non-fatal)
    if (this.google && event.calendarId) {
      try {
        const calendar = await repo.getCalendarForMutation(
          event.calendarId,
          userSub,
          'editor',
        );
        if (calendar?.syncMode === 'push') {
          await this.google.updateGoogleEvent(
            userSub,
            event.googleEventId,
            event,
            'primary',
          );
        } else if (
          calendar?.syncMode === 'two_way' &&
          calendar.googleCalId
        ) {
          await this.google.updateGoogleEvent(
            userSub,
            event.googleEventId,
            event,
            calendar.googleCalId,
          );
        }
      } catch (syncErr) {
        console.error(
          'CalendarService.updateEvent Google sync failed:',
          (syncErr as Error).message,
        );
      }
    }

    return event;
  }

  async deleteEvent(id: string, userSub: string): Promise<void> {
    const existing = await repo.getCalendarEventById(id, userSub);
    if (!existing) throw new NotFoundError('Event not found');

    await repo.deleteCalendarEvent(id, userSub);

    // Clean up Google after the DB row is gone (non-fatal)
    if (this.google && existing.calendarId) {
      try {
        const calendar = await repo.getCalendarForMutation(
          existing.calendarId,
          userSub,
          'editor',
        );
        if (calendar?.syncMode === 'push') {
          await this.google.deleteGoogleEvent(
            userSub,
            existing.googleEventId,
            'primary',
          );
        } else if (
          calendar?.syncMode === 'two_way' &&
          calendar.googleCalId
        ) {
          await this.google.deleteGoogleEvent(
            userSub,
            existing.googleEventId,
            calendar.googleCalId,
          );
        }
      } catch (syncErr) {
        console.error(
          'CalendarService.deleteEvent Google sync failed:',
          (syncErr as Error).message,
        );
      }
    }
  }

  // -----------------------------------------------------------------------
  // Calendars
  // -----------------------------------------------------------------------

  async getCalendars(userSub: string): Promise<Calendar[]> {
    return repo.getCalendars(userSub);
  }

  async createCalendar(
    input: CreateCalendarInput,
    userSub: string,
  ): Promise<Calendar> {
    if (!input.name) {
      throw new ValidationError('name is required');
    }
    return repo.createCalendar(input, userSub);
  }

  async updateCalendar(
    id: string,
    fields: UpdateCalendarInput,
    userSub: string,
  ): Promise<Calendar> {
    // owner-only
    const owned = await repo.getCalendarForMutation(id, userSub, 'owner');
    if (!owned) throw new ForbiddenError('Not authorized');

    // strip undefined
    const cleanFields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) cleanFields[k] = v;
    }
    if (Object.keys(cleanFields).length === 0) {
      throw new ValidationError('No fields provided to update');
    }

    const calendar = await repo.updateCalendar(id, cleanFields as UpdateCalendarInput, userSub);
    if (!calendar) throw new NotFoundError('Calendar not found');
    return calendar;
  }

  async deleteCalendar(id: string, userSub: string): Promise<void> {
    const calendar = await repo.getCalendarForMutation(id, userSub, 'owner');
    if (!calendar) throw new ForbiddenError('Not authorized');

    // remove all member ACL entries from Google before deleting
    if (
      this.google &&
      calendar.syncMode === 'two_way' &&
      calendar.googleCalId
    ) {
      const members = await repo.getCalendarMembers(id);
      await Promise.allSettled(
        members.map((m) =>
          this.google!.removeCalendarAclEntry(
            userSub,
            calendar.googleCalId!,
            m.email!,
          ),
        ),
      );
    }

    // stop the watch channel before deleting
    if (this.google && calendar.googleCalId) {
      try {
        await this.google.stopWatchByCalId(userSub, calendar.googleCalId);
      } catch (watchErr) {
        console.error(
          'CalendarService.deleteCalendar stopWatchByCalId failed:',
          (watchErr as Error).message,
        );
      }
    }

    await repo.deleteCalendar(id, userSub);
  }

  async connectGoogle(
    id: string,
    userSub: string,
  ): Promise<Calendar> {
    if (!this.google) {
      throw new Error('Google Calendar utils not configured');
    }

    const calendar = await repo.getCalendarForMutation(id, userSub, 'owner');
    if (!calendar) throw new ForbiddenError('Not authorized');

    // already connected -- idempotent
    if (calendar.googleCalId) return calendar;

    const token = await this.google.getValidAccessToken(userSub);
    const { calId, calName } = await this.google.createDedicatedCalendar(
      token,
      calendar.name,
    );

    const updated = await repo.updateCalendar(
      id,
      { googleCalId: calId, googleCalName: calName },
      userSub,
    );

    // register the watch channel after saving the calId
    try {
      await this.google.registerWatch(userSub, calId);
    } catch (watchErr) {
      console.error(
        'CalendarService.connectGoogle registerWatch failed:',
        (watchErr as Error).message,
      );
    }

    return updated!;
  }

  async disconnectGoogle(
    id: string,
    userSub: string,
  ): Promise<Calendar> {
    const calendar = await repo.getCalendarForMutation(id, userSub, 'owner');
    if (!calendar) throw new ForbiddenError('Not authorized');

    if (this.google && calendar.googleCalId) {
      try {
        await this.google.stopWatchByCalId(userSub, calendar.googleCalId);
      } catch (watchErr) {
        console.error(
          'CalendarService.disconnectGoogle stopWatchByCalId failed:',
          (watchErr as Error).message,
        );
      }
    }

    const updated = await repo.updateCalendar(
      id,
      { googleCalId: null, googleCalName: null, syncMode: 'push' },
      userSub,
    );

    return updated!;
  }

  // -----------------------------------------------------------------------
  // Calendar Members (sharing)
  // -----------------------------------------------------------------------

  async getMembers(
    calendarId: string,
    userSub: string,
    requestorEmail: string | null,
  ): Promise<CalendarMember[]> {
    const authorized = await repo.isOwnerOrMember(calendarId, userSub);
    if (!authorized) throw new ForbiddenError('Not authorized');

    const calRow = await repo.getCalendarRowById(calendarId);
    if (!calRow) throw new NotFoundError('Calendar not found');

    const ownerUser = await repo.getUserBySub(calRow.user_sub);
    const ownerEmail =
      ownerUser?.email ??
      (calRow.user_sub === userSub ? requestorEmail : null);

    const ownerEntry: CalendarMember = {
      id: null,
      calendarId,
      userSub: calRow.user_sub,
      email: ownerEmail,
      role: 'owner',
      invitedBy: null,
      createdAt: calRow.created_at instanceof Date
        ? calRow.created_at.toISOString()
        : (calRow.created_at as string),
    };

    const members = await repo.getCalendarMembers(calendarId);
    return [ownerEntry, ...members];
  }

  async inviteMember(
    calendarId: string,
    email: string,
    role: string,
    ownerSub: string,
  ): Promise<CalendarMember> {
    if (!email) throw new ValidationError('email is required');
    if (!['editor', 'viewer'].includes(role)) {
      throw new ValidationError('role must be editor or viewer');
    }

    const cal = await repo.getCalendarForMutation(calendarId, ownerSub, 'owner');
    if (!cal) throw new ForbiddenError('Not authorized');

    const target = await repo.getUserByEmail(email);
    if (!target) throw new NotFoundError('No account found for that email address.');
    if (target.sub === ownerSub) {
      throw new ValidationError('You cannot share a calendar with yourself.');
    }

    const member = await repo.addCalendarMember(
      calendarId,
      target.sub,
      role,
      ownerSub,
    );

    // fire-and-forget Google ACL
    if (
      this.google &&
      cal.syncMode === 'two_way' &&
      cal.googleCalId
    ) {
      this.google
        .addCalendarAclEntry(ownerSub, cal.googleCalId, email, member.role)
        .catch((err: Error) =>
          console.warn(
            '[calendar] addCalendarAclEntry failed (non-fatal):',
            err.message,
          ),
        );
    }

    return member;
  }

  async updateMemberRole(
    calendarId: string,
    memberSub: string,
    role: string,
    ownerSub: string,
  ): Promise<CalendarMember> {
    if (!['editor', 'viewer'].includes(role)) {
      throw new ValidationError('role must be editor or viewer');
    }

    const cal = await repo.getCalendarForMutation(calendarId, ownerSub, 'owner');
    if (!cal) throw new ForbiddenError('Not authorized');

    const member = await repo.updateCalendarMemberRole(
      calendarId,
      memberSub,
      role,
      ownerSub,
    );
    if (!member) throw new NotFoundError('Member not found');
    return member;
  }

  /**
   * Removes a member from a calendar.
   * If memberSub === userSub this is a self-removal (any member can leave).
   * Otherwise it's an owner removing someone else.
   * Returns { googleAclRemoved } matching the JS API contract.
   */
  async removeMember(
    calendarId: string,
    memberSub: string,
    userSub: string,
  ): Promise<{ googleAclRemoved: boolean }> {
    const isSelfRemoval = memberSub === userSub;

    if (isSelfRemoval) {
      const row = await repo.removeSelfFromCalendar(calendarId, userSub);
      if (!row) throw new NotFoundError('Not a member of this calendar');

      let googleAclRemoved = true;
      try {
        const calInfo = await repo.getCalendarOwnerInfo(calendarId);
        if (
          this.google &&
          calInfo?.syncMode === 'two_way' &&
          calInfo.googleCalId
        ) {
          const memberUser = await repo.getUserBySub(userSub);
          if (memberUser?.email) {
            await this.google.removeCalendarAclEntry(
              calInfo.ownerSub,
              calInfo.googleCalId,
              memberUser.email,
            );
          }
        }
      } catch {
        googleAclRemoved = false;
      }
      return { googleAclRemoved };
    }

    // owner removing someone else
    const cal = await repo.getCalendarForMutation(calendarId, userSub, 'owner');
    if (!cal) throw new ForbiddenError('Not authorized');

    const removed = await repo.removeCalendarMember(
      calendarId,
      memberSub,
      userSub,
    );
    if (!removed) throw new NotFoundError('Member not found');

    let googleAclRemoved = true;
    try {
      const memberUser = await repo.getUserBySub(memberSub);
      if (
        this.google &&
        cal.syncMode === 'two_way' &&
        cal.googleCalId &&
        memberUser?.email
      ) {
        await this.google.removeCalendarAclEntry(
          userSub,
          cal.googleCalId,
          memberUser.email,
        );
      }
    } catch {
      googleAclRemoved = false;
    }

    return { googleAclRemoved };
  }

  // -----------------------------------------------------------------------
  // Event Cards
  // -----------------------------------------------------------------------

  async getEventCards(
    eventId: string,
    userSub: string,
  ): Promise<EventCard[]> {
    return repo.getEventCards(eventId, userSub);
  }

  async addEventCard(
    input: AddEventCardInput,
    userSub: string,
  ): Promise<EventCard> {
    if (!input.cardId || !input.cardName) {
      throw new ValidationError('cardId and cardName are required');
    }
    const card = await repo.addEventCard(input, userSub);
    if (!card) throw new NotFoundError('Event not found');
    return card;
  }

  async updateEventCard(
    entryId: string,
    eventId: string,
    fields: UpdateEventCardInput,
    userSub: string,
  ): Promise<EventCard> {
    if (!fields || Object.keys(fields).length === 0) {
      throw new ValidationError('No fields provided to update');
    }
    const card = await repo.updateEventCard(entryId, eventId, fields, userSub);
    if (!card) throw new NotFoundError('Card entry not found');
    return card;
  }

  async deleteEventCard(
    entryId: string,
    eventId: string,
    userSub: string,
  ): Promise<void> {
    const deleted = await repo.deleteEventCard(entryId, eventId, userSub);
    if (!deleted) throw new NotFoundError('Card entry not found');
  }

  // -----------------------------------------------------------------------
  // Countdowns
  // -----------------------------------------------------------------------

  async getCountdowns(
    userSub: string,
    cursor: string | null,
  ): Promise<CountdownPage> {
    return repo.getCountdowns(userSub, cursor);
  }

  async getCountdownById(
    id: string,
    userSub: string,
  ): Promise<Countdown> {
    const countdown = await repo.getCountdownById(id, userSub);
    if (!countdown) throw new NotFoundError('Countdown not found');
    return countdown;
  }

  async createCountdown(
    input: CreateCountdownInput,
    userSub: string,
  ): Promise<Countdown> {
    if (!input.title || !input.targetDate) {
      throw new ValidationError('title and targetDate are required');
    }
    return repo.createCountdown(input, userSub);
  }

  async updateCountdown(
    id: string,
    fields: UpdateCountdownInput,
    userSub: string,
  ): Promise<Countdown> {
    if (!fields || Object.keys(fields).length === 0) {
      throw new ValidationError('No fields provided to update');
    }
    const countdown = await repo.updateCountdown(id, fields, userSub);
    if (!countdown) throw new NotFoundError('Countdown not found');
    return countdown;
  }

  async deleteCountdown(id: string, userSub: string): Promise<void> {
    const deleted = await repo.deleteCountdown(id, userSub);
    if (!deleted) throw new NotFoundError('Countdown not found');
  }
}
