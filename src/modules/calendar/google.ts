import type { GoogleCalendarUtils } from './service.js';

// The Google helpers are still CommonJS. This is the one place the calendar
// module picks them up, so the service can't be built without them again.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const calendarApi = require('../../../utils/googleCalendar');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getValidAccessToken } = require('../../../utils/googleToken');

export const googleCalendarUtils: GoogleCalendarUtils = {
  createGoogleEvent: calendarApi.createGoogleEvent,
  updateGoogleEvent: calendarApi.updateGoogleEvent,
  deleteGoogleEvent: calendarApi.deleteGoogleEvent,
  stopWatchByCalId: calendarApi.stopWatchByCalId,
  createDedicatedCalendar: calendarApi.createDedicatedCalendar,
  registerWatch: calendarApi.registerWatch,
  getValidAccessToken,
  addCalendarAclEntry: calendarApi.addCalendarAclEntry,
  removeCalendarAclEntry: calendarApi.removeCalendarAclEntry,
};
