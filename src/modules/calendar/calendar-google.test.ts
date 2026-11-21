import { describe, test, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const USER = 'auth0|owner';
const CALENDAR_ID = '11111111-1111-1111-1111-111111111111';
const EVENT_ID = '22222222-2222-2222-2222-222222222222';

vi.mock('../../config/auth.js', () => ({
  checkJwt: (req: any, _res: any, next: any) => {
    req.auth = { payload: { sub: USER } };
    next();
  },
  optionalCheckJwt: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../middleware/upsertUser.js', () => ({
  upsertUser: (_req: any, _res: any, next: any) => next(),
}));

const repoFns = vi.hoisted(() => ({
  getCalendarForMutation: vi.fn(),
  updateCalendar: vi.fn(),
  createCalendarEvent: vi.fn(),
  setEventGoogleId: vi.fn(),
  removeCalendarMember: vi.fn(),
  getUserBySub: vi.fn(),
}));
vi.mock('./repository.js', () => ({
  CalendarRepository: class {
    getCalendarForMutation = repoFns.getCalendarForMutation;
    updateCalendar = repoFns.updateCalendar;
    createCalendarEvent = repoFns.createCalendarEvent;
    setEventGoogleId = repoFns.setEventGoogleId;
    removeCalendarMember = repoFns.removeCalendarMember;
    getUserBySub = repoFns.getUserBySub;
  },
}));

const google = vi.hoisted(() => ({
  createGoogleEvent: vi.fn(),
  updateGoogleEvent: vi.fn(),
  deleteGoogleEvent: vi.fn(),
  stopWatchByCalId: vi.fn(),
  createDedicatedCalendar: vi.fn(),
  registerWatch: vi.fn(),
  getValidAccessToken: vi.fn(),
  addCalendarAclEntry: vi.fn(),
  removeCalendarAclEntry: vi.fn(),
}));
vi.mock('./google.js', () => ({ googleCalendarUtils: google }));

import calendarRouter from './routes.js';
import { errorHandler } from '../../middleware/errorHandler.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/calendar', calendarRouter);
  app.use(errorHandler);
  return app;
}

const twoWayCalendar = {
  id: CALENDAR_ID,
  name: 'Family',
  syncMode: 'two_way',
  googleCalId: 'family@group.calendar.google.com',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('calendar Google sync is wired up', () => {
  test('connecting a calendar creates its Google calendar and watches it', async () => {
    repoFns.getCalendarForMutation.mockResolvedValue({ ...twoWayCalendar, googleCalId: null });
    repoFns.updateCalendar.mockResolvedValue({ ...twoWayCalendar, googleCalName: 'Family' });
    google.getValidAccessToken.mockResolvedValue('access-token');
    google.createDedicatedCalendar.mockResolvedValue({ calId: twoWayCalendar.googleCalId, calName: 'Family' });

    const res = await request(makeApp()).post(`/api/calendar/calendars/${CALENDAR_ID}/connect-google`);

    expect(res.status).toBe(200);
    expect(google.createDedicatedCalendar).toHaveBeenCalledWith('access-token', 'Family');
    expect(google.registerWatch).toHaveBeenCalledWith(USER, twoWayCalendar.googleCalId);
  });

  test('a new event on a two-way calendar is pushed to its Google calendar', async () => {
    const event = { id: EVENT_ID, calendarId: CALENDAR_ID, title: 'Dinner' };
    repoFns.createCalendarEvent.mockResolvedValue(event);
    repoFns.getCalendarForMutation.mockResolvedValue(twoWayCalendar);
    google.createGoogleEvent.mockResolvedValue('google-event-1');

    const res = await request(makeApp())
      .post('/api/calendar/events')
      .send({ title: 'Dinner', startDate: '2026-11-20', endDate: '2026-11-20', calendarId: CALENDAR_ID });

    expect(res.status).toBe(201);
    expect(google.createGoogleEvent).toHaveBeenCalledWith(USER, event, twoWayCalendar.googleCalId);
    expect(repoFns.setEventGoogleId).toHaveBeenCalledWith(EVENT_ID, 'google-event-1', USER);
  });

  test('removing a member from a two-way calendar revokes their Google access', async () => {
    repoFns.getCalendarForMutation.mockResolvedValue(twoWayCalendar);
    repoFns.removeCalendarMember.mockResolvedValue(true);
    repoFns.getUserBySub.mockResolvedValue({ sub: 'auth0|member', email: 'member@example.com' });

    const res = await request(makeApp()).delete(`/api/calendar/calendars/${CALENDAR_ID}/members/auth0%7Cmember`);

    expect(res.status).toBe(200);
    expect(google.removeCalendarAclEntry).toHaveBeenCalledWith(USER, twoWayCalendar.googleCalId, 'member@example.com');
    expect(res.body.googleAclRemoved).toBe(true);
  });
});
