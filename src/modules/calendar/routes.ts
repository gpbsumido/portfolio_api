// ---------------------------------------------------------------------------
// Calendar module — Express router
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { CalendarController } from './controller.js';
import { checkJwt } from '../../config/auth.js';
import { validateBody } from '../../middleware/validate.js';
import {
  createEventSchema,
  updateEventSchema,
  createCalendarSchema,
  updateCalendarSchema,
  createCountdownSchema,
  updateCountdownSchema,
  addMemberSchema,
  updateMemberSchema,
  addEventCardSchema,
  updateEventCardSchema,
} from './schemas.js';

const router = Router();
const ctrl = new CalendarController();

// All calendar routes require a valid Auth0 token.
// The JS version also uses upsertUser middleware; that middleware is not yet
// migrated to TS so it should be applied at the app level or added here once
// it is converted.
router.use(checkJwt);

// ---------------------------------------------------------------------------
// Calendar Events — /events
// ---------------------------------------------------------------------------

router.get('/events', (req, res, next) => ctrl.getEvents(req, res, next));
router.get('/events/:id', (req, res, next) => ctrl.getEventById(req, res, next));
router.post('/events', validateBody(createEventSchema), (req, res, next) => ctrl.createEvent(req, res, next));
router.put('/events/:id', validateBody(updateEventSchema), (req, res, next) => ctrl.updateEvent(req, res, next));
router.delete('/events/:id', (req, res, next) => ctrl.deleteEvent(req, res, next));

// ---------------------------------------------------------------------------
// Calendars — /calendars
// ---------------------------------------------------------------------------

router.get('/calendars', (req, res, next) => ctrl.getCalendars(req, res, next));
router.post('/calendars', validateBody(createCalendarSchema), (req, res, next) => ctrl.createCalendar(req, res, next));
router.put('/calendars/:id', validateBody(updateCalendarSchema), (req, res, next) => ctrl.updateCalendar(req, res, next));
router.delete('/calendars/:id', (req, res, next) => ctrl.deleteCalendar(req, res, next));

// Google Calendar connection
router.post('/calendars/:id/connect-google', (req, res, next) =>
  ctrl.connectGoogle(req, res, next),
);
router.delete('/calendars/:id/google', (req, res, next) =>
  ctrl.disconnectGoogle(req, res, next),
);

// ---------------------------------------------------------------------------
// Sharing — /calendars/:id/members
// ---------------------------------------------------------------------------

router.get('/calendars/:id/members', (req, res, next) =>
  ctrl.getMembers(req, res, next),
);
router.post('/calendars/:id/members', validateBody(addMemberSchema), (req, res, next) =>
  ctrl.inviteMember(req, res, next),
);
router.put('/calendars/:id/members/:memberSub', validateBody(updateMemberSchema), (req, res, next) =>
  ctrl.updateMemberRole(req, res, next),
);
router.delete('/calendars/:id/members/:memberSub', (req, res, next) =>
  ctrl.removeMember(req, res, next),
);

// ---------------------------------------------------------------------------
// Event Cards — /events/:id/cards
// ---------------------------------------------------------------------------

router.get('/events/:id/cards', (req, res, next) =>
  ctrl.getEventCards(req, res, next),
);
router.post('/events/:id/cards', validateBody(addEventCardSchema), (req, res, next) =>
  ctrl.addEventCard(req, res, next),
);
router.put('/events/:id/cards/:entryId', validateBody(updateEventCardSchema), (req, res, next) =>
  ctrl.updateEventCard(req, res, next),
);
router.delete('/events/:id/cards/:entryId', (req, res, next) =>
  ctrl.deleteEventCard(req, res, next),
);

// ---------------------------------------------------------------------------
// Countdowns — /countdowns
// ---------------------------------------------------------------------------

router.get('/countdowns', (req, res, next) => ctrl.getCountdowns(req, res, next));
router.get('/countdowns/:id', (req, res, next) =>
  ctrl.getCountdownById(req, res, next),
);
router.post('/countdowns', validateBody(createCountdownSchema), (req, res, next) =>
  ctrl.createCountdown(req, res, next),
);
router.put('/countdowns/:id', validateBody(updateCountdownSchema), (req, res, next) =>
  ctrl.updateCountdown(req, res, next),
);
router.delete('/countdowns/:id', (req, res, next) =>
  ctrl.deleteCountdown(req, res, next),
);

export default router;
