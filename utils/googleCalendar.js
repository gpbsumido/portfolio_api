const { getValidAccessToken } = require("./googleToken");

const GCAL_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary";

// maps our EVENT_COLORS hex values to the closest Google Calendar colorId.
// Google's colorId reference: https://developers.google.com/calendar/api/v3/reference/colors/get
const COLOR_MAP = {
  "#6366f1": "9",  // blueberry
  "#f43f5e": "11", // tomato
  "#f97316": "6",  // tangerine
  "#eab308": "5",  // banana
  "#22c55e": "10", // sage
  "#06b6d4": "7",  // peacock
  "#8b5cf6": "3",  // grape
  "#ec4899": "4",  // flamingo
};

/**
 * Converts one of our event objects to the shape Google Calendar expects.
 * All-day events use { date: "YYYY-MM-DD" }, timed events use { dateTime, timeZone }.
 *
 * @param {{ title: string, description?: string, startDate: string, endDate: string, allDay: boolean, color?: string }} event
 * @returns {Object} Google Calendar Event resource body
 */
function toGoogleEvent(event) {
  const { title, description, startDate, endDate, allDay, color } = event;

  // for all-day events Google wants just the date, not a full ISO timestamp.
  // we slice the first 10 chars which gives us "YYYY-MM-DD" regardless of
  // whether startDate is already a date string or a full ISO datetime.
  const dateOnly = (iso) => iso.slice(0, 10);

  const start = allDay
    ? { date: dateOnly(startDate) }
    : { dateTime: startDate, timeZone: "UTC" };

  const end = allDay
    ? { date: dateOnly(endDate) }
    : { dateTime: endDate, timeZone: "UTC" };

  const body = {
    summary: title,
    start,
    end,
  };

  if (description) body.description = description;
  if (color) body.colorId = COLOR_MAP[color.toLowerCase()] ?? "9";

  return body;
}

/**
 * Creates an event in Google Calendar and returns the Google event ID.
 * Returns null if the user is not connected, so callers don't have to check
 * connection status before calling this.
 *
 * @param {string} userId - Auth0 sub
 * @param {{ title: string, description?: string, startDate: string, endDate: string, allDay: boolean, color?: string }} event
 * @returns {Promise<string|null>} Google event ID, or null if user is not connected
 */
async function createGoogleEvent(userId, event) {
  let token;
  try {
    token = await getValidAccessToken(userId);
  } catch {
    // user is not connected, nothing to do
    return null;
  }

  const res = await fetch(`${GCAL_BASE}/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(toGoogleEvent(event)),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google create event failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return data.id;
}

/**
 * Updates an existing Google Calendar event. Skips silently if googleEventId
 * is null or undefined, which happens for events created before sync was connected.
 *
 * @param {string} userId - Auth0 sub
 * @param {string|null} googleEventId
 * @param {{ title?: string, description?: string, startDate?: string, endDate?: string, allDay?: boolean, color?: string }} fields
 */
async function updateGoogleEvent(userId, googleEventId, fields) {
  if (!googleEventId) return;

  let token;
  try {
    token = await getValidAccessToken(userId);
  } catch {
    return;
  }

  const res = await fetch(`${GCAL_BASE}/events/${googleEventId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(toGoogleEvent(fields)),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google update event failed (${res.status}): ${body}`);
  }
}

/**
 * Deletes an event from Google Calendar. 404s are swallowed since the event
 * may have already been deleted on the Google side before we got here.
 *
 * @param {string} userId - Auth0 sub
 * @param {string} googleEventId
 */
async function deleteGoogleEvent(userId, googleEventId) {
  if (!googleEventId) return;

  let token;
  try {
    token = await getValidAccessToken(userId);
  } catch {
    return;
  }

  const res = await fetch(`${GCAL_BASE}/events/${googleEventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  // 404 means it's already gone, that's fine
  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`Google delete event failed (${res.status}): ${body}`);
  }
}

/**
 * Fetches incremental changes from Google Calendar using the stored sync token.
 * Passing null for syncToken triggers a full sync (bootstrapping or after a 410).
 * Returns { items, nextSyncToken } where items may include cancelled events.
 *
 * @param {string} userId - Auth0 sub
 * @param {string|null} syncToken
 * @returns {Promise<{ items: Array, nextSyncToken: string }>}
 */
async function fetchIncrementalEvents(userId, syncToken) {
  const token = await getValidAccessToken(userId);

  const params = new URLSearchParams({ singleEvents: "true" });
  if (syncToken) params.set("syncToken", syncToken);

  const res = await fetch(
    `${GCAL_BASE}/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  // 410 Gone means the sync token is stale, do a full re-sync
  if (res.status === 410) {
    console.log(`[googleCalendar] sync token expired for ${userId}, doing full sync`);
    return fetchIncrementalEvents(userId, null);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google list events failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return { items: data.items ?? [], nextSyncToken: data.nextSyncToken };
}

module.exports = {
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  fetchIncrementalEvents,
};
