// ---------------------------------------------------------------------------
// Calendar module — Controller (HTTP layer)
// ---------------------------------------------------------------------------

import type { Request, Response, NextFunction } from 'express';
import { CalendarService } from './service.js';
import type {
  CalendarEventFilters,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
  CreateCalendarInput,
  UpdateCalendarInput,
  CreateCountdownInput,
  UpdateCountdownInput,
  AddEventCardInput,
  UpdateEventCardInput,
} from './types.js';

const service = new CalendarService();

/** Extract a single string param (Express 5 params can be string | string[]). */
function param(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

export class CalendarController {
  // -----------------------------------------------------------------------
  // Calendar Events
  // -----------------------------------------------------------------------

  async getEvents(req: Request, res: Response, next: NextFunction) {
    try {
      const userSub = (req as any).auth.payload.sub as string;
      const { start, end, cardId, cardName, calendarId } = req.query;
      const filters: CalendarEventFilters = {
        start: start as string | undefined,
        end: end as string | undefined,
        cardId: cardId as string | undefined,
        cardName: cardName as string | undefined,
        calendarId: calendarId as string | undefined,
      };
      const events = await service.getEvents(userSub, filters);
      res.json({ events });
    } catch (err) {
      next(err);
    }
  }

  async getEventById(req: Request, res: Response, next: NextFunction) {
    try {
      const userSub = (req as any).auth.payload.sub as string;
      const id = param(req.params.id);
      const event = await service.getEventById(id, userSub);
      res.json({ event });
    } catch (err) {
      next(err);
    }
  }

  async createEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const userSub = (req as any).auth.payload.sub as string;
      const input: CreateCalendarEventInput = req.body;
      const event = await service.createEvent(input, userSub);
      res.status(201).json({ event });
    } catch (err) {
      next(err);
    }
  }

  async updateEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const userSub = (req as any).auth.payload.sub as string;
      const id = param(req.params.id);
      const fields: UpdateCalendarEventInput = req.body;
      const event = await service.updateEvent(id, fields, userSub);
      res.json({ event });
    } catch (err) {
      next(err);
    }
  }

  async deleteEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const userSub = (req as any).auth.payload.sub as string;
      const id = param(req.params.id);
      await service.deleteEvent(id, userSub);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  // -----------------------------------------------------------------------
  // Calendars
  // -----------------------------------------------------------------------

  async getCalendars(req: Request, res: Response, next: NextFunction) {
    try {
      const userSub = (req as any).auth.payload.sub as string;
      const calendars = await service.getCalendars(userSub);
      res.json({ calendars });
    } catch (err) {
      next(err);
    }
  }

  async createCalendar(req: Request, res: Response, next: NextFunction) {
    try {
      const userSub = (req as any).auth.payload.sub as string;
      const input: CreateCalendarInput = req.body;
      const calendar = await service.createCalendar(input, userSub);
      res.status(201).json({ calendar });
    } catch (err) {
      next(err);
    }
  }

  async updateCalendar(req: Request, res: Response, next: NextFunction) {
    try {
      const userSub = (req as any).auth.payload.sub as string;
      const id = param(req.params.id);
      const { name, color, syncMode, googleCalId, googleCalName } = req.body;
      const fields: UpdateCalendarInput = {};

      // only include defined fields so the service can detect "no fields"
      if (name !== undefined) fields.name = name;
      if (color !== undefined) fields.color = color;
      if (syncMode !== undefined) fields.syncMode = syncMode;
      if (googleCalId !== undefined) fields.googleCalId = googleCalId;
      if (googleCalName !== undefined) fields.googleCalName = googleCalName;

      const calendar = await service.updateCalendar(id, fields, userSub);
      res.json({ calendar });
    } catch (err) {
      next(err);
    }
  }

  async deleteCalendar(req: Request, res: Response, next: NextFunction) {
    try {
      const userSub = (req as any).auth.payload.sub as string;
      const id = param(req.params.id);
      await service.deleteCalendar(id, userSub);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  async connectGoogle(req: Request, res: Response, next: NextFunction) {
    try {
      const userSub = (req as any).auth.payload.sub as string;
      const id = param(req.params.id);
      const calendar = await service.connectGoogle(id, userSub);
      res.json({ calendar });
    } catch (err) {
      next(err);
    }
  }

  async disconnectGoogle(req: Request, res: Response, next: NextFunction) {
    try {
      const userSub = (req as any).auth.payload.sub as string;
      const id = param(req.params.id);
      const calendar = await service.disconnectGoogle(id, userSub);
      res.json({ calendar });
    } catch (err) {
      next(err);
    }
  }

  // -----------------------------------------------------------------------
  // Calendar Members (sharing)
  // -----------------------------------------------------------------------

  async getMembers(req: Request, res: Response, next: NextFunction) {
    try {
      const userSub = (req as any).auth.payload.sub as string;
      const calendarId = param(req.params.id);
      const requestorEmail =
        ((req as any).auth?.payload?.email as string) ?? null;
      const members = await service.getMembers(
        calendarId,
        userSub,
        requestorEmail,
      );
      res.json({ members });
    } catch (err) {
      next(err);
    }
  }

  async inviteMember(req: Request, res: Response, next: NextFunction) {
    try {
      const userSub = (req as any).auth.payload.sub as string;
      const calendarId = param(req.params.id);
      const { email, role = 'editor' } = req.body;
      const member = await service.inviteMember(
        calendarId,
        email,
        role,
        userSub,
      );
      res.status(201).json({ member });
    } catch (err) {
      next(err);
    }
  }

  async updateMemberRole(req: Request, res: Response, next: NextFunction) {
    try {
      const userSub = (req as any).auth.payload.sub as string;
      const calendarId = param(req.params.id);
      const memberSub = param(req.params.memberSub);
      const { role } = req.body;
      const member = await service.updateMemberRole(
        calendarId,
        memberSub,
        role,
        userSub,
      );
      res.json({ member });
    } catch (err) {
      next(err);
    }
  }

  async removeMember(req: Request, res: Response, next: NextFunction) {
    try {
      const userSub = (req as any).auth.payload.sub as string;
      const calendarId = param(req.params.id);
      const rawMemberSub = param(req.params.memberSub);
      // "me" is a convenience alias
      const memberSub = rawMemberSub === 'me' ? userSub : rawMemberSub;
      const result = await service.removeMember(
        calendarId,
        memberSub,
        userSub,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  // -----------------------------------------------------------------------
  // Event Cards
  // -----------------------------------------------------------------------

  async getEventCards(req: Request, res: Response, next: NextFunction) {
    try {
      const userSub = (req as any).auth.payload.sub as string;
      const eventId = param(req.params.id);
      const cards = await service.getEventCards(eventId, userSub);
      res.json({ cards });
    } catch (err) {
      next(err);
    }
  }

  async addEventCard(req: Request, res: Response, next: NextFunction) {
    try {
      const userSub = (req as any).auth.payload.sub as string;
      const eventId = param(req.params.id);
      const { cardId, cardName, cardSetId, cardSetName, cardImageUrl, quantity, notes } = req.body;
      const input: AddEventCardInput = {
        eventId,
        cardId,
        cardName,
        cardSetId,
        cardSetName,
        cardImageUrl,
        quantity,
        notes,
      };
      const card = await service.addEventCard(input, userSub);
      res.status(201).json({ card });
    } catch (err) {
      next(err);
    }
  }

  async updateEventCard(req: Request, res: Response, next: NextFunction) {
    try {
      const userSub = (req as any).auth.payload.sub as string;
      const eventId = param(req.params.id);
      const entryId = param(req.params.entryId);
      const fields: UpdateEventCardInput = req.body;
      const card = await service.updateEventCard(
        entryId,
        eventId,
        fields,
        userSub,
      );
      res.json({ card });
    } catch (err) {
      next(err);
    }
  }

  async deleteEventCard(req: Request, res: Response, next: NextFunction) {
    try {
      const userSub = (req as any).auth.payload.sub as string;
      const eventId = param(req.params.id);
      const entryId = param(req.params.entryId);
      await service.deleteEventCard(entryId, eventId, userSub);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  // -----------------------------------------------------------------------
  // Countdowns
  // -----------------------------------------------------------------------

  async getCountdowns(req: Request, res: Response, next: NextFunction) {
    try {
      const userSub = (req as any).auth.payload.sub as string;
      const cursor = (req.query.cursor as string) || null;
      const result = await service.getCountdowns(userSub, cursor);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async getCountdownById(req: Request, res: Response, next: NextFunction) {
    try {
      const userSub = (req as any).auth.payload.sub as string;
      const id = param(req.params.id);
      const countdown = await service.getCountdownById(id, userSub);
      res.json({ countdown });
    } catch (err) {
      next(err);
    }
  }

  async createCountdown(req: Request, res: Response, next: NextFunction) {
    try {
      const userSub = (req as any).auth.payload.sub as string;
      const input: CreateCountdownInput = req.body;
      const countdown = await service.createCountdown(input, userSub);
      res.status(201).json({ countdown });
    } catch (err) {
      next(err);
    }
  }

  async updateCountdown(req: Request, res: Response, next: NextFunction) {
    try {
      const userSub = (req as any).auth.payload.sub as string;
      const id = param(req.params.id);
      const fields: UpdateCountdownInput = req.body;
      const countdown = await service.updateCountdown(id, fields, userSub);
      res.json({ countdown });
    } catch (err) {
      next(err);
    }
  }

  async deleteCountdown(req: Request, res: Response, next: NextFunction) {
    try {
      const userSub = (req as any).auth.payload.sub as string;
      const id = param(req.params.id);
      await service.deleteCountdown(id, userSub);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
}
